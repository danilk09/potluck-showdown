import {
  addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp,
  setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { dishFields, newDishDoc, newPotluckDoc, potluckFields, voteWrites } from './builders';
import { IMAGE_REF_PREFIX, isImageRef } from '../lib/images';
import { podiumFrom, rankDishes, resultsSummary, toMillis } from '../lib/scoring';
import { normalizeInviteCode } from '../lib/inviteCode';

function uid() {
  const id = auth.currentUser?.uid;
  if (!id) throw new Error('Please sign in first.');
  return id;
}

export function friendlyError(err) {
  const code = err?.code ?? '';
  if (code === 'permission-denied') return 'You don’t have permission to do that right now.';
  if (code === 'unavailable') return 'You appear to be offline. Try again when you’re connected.';
  return err?.message?.replace(/^Firebase:\s*/, '') || 'Something went wrong.';
}

// ---------- profiles ----------

export async function ensureProfile(user, displayName) {
  const ref = doc(db, 'publicProfiles', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      displayName: (displayName || user.displayName || 'Potluck guest').slice(0, 40),
      photoURL: null,
      frame: null,
      isGuest: user.isAnonymous,
      updatedAt: serverTimestamp(),
    });
  }
  await setDoc(doc(db, 'users', user.uid), {
    email: user.email ?? null,
    lastSeenAt: serverTimestamp(),
    ...(snap.exists() ? {} : { createdAt: serverTimestamp() }),
  }, { merge: true });
}

export function updateMyProfile(patch) {
  return setDoc(doc(db, 'publicProfiles', uid()), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
}

// ---------- images ----------

export async function uploadImage(potluckId, dataUrl) {
  const ref = await addDoc(collection(db, 'potlucks', potluckId, 'images'), {
    ownerId: uid(),
    data: dataUrl,
    createdAt: serverTimestamp(),
  });
  return `${IMAGE_REF_PREFIX}${potluckId}/${ref.id}`;
}

const imageCache = new Map();

/** Resolves an `img:<potluck>/<id>` reference (or plain URL) to something an <img> can show. */
export function loadImage(ref) {
  if (!ref) return Promise.resolve(null);
  if (!isImageRef(ref)) return Promise.resolve(ref);
  if (!imageCache.has(ref)) {
    const [potluckId, imageId] = ref.slice(IMAGE_REF_PREFIX.length).split('/');
    imageCache.set(ref, getDoc(doc(db, 'potlucks', potluckId, 'images', imageId))
      .then((s) => (s.exists() ? s.data().data : null))
      .catch((err) => {
        imageCache.delete(ref);
        throw err;
      }));
  }
  return imageCache.get(ref);
}

async function deleteImage(ref) {
  if (!isImageRef(ref)) return;
  const [potluckId, imageId] = ref.slice(IMAGE_REF_PREFIX.length).split('/');
  imageCache.delete(ref);
  await deleteDoc(doc(db, 'potlucks', potluckId, 'images', imageId)).catch(() => {});
}

// ---------- potlucks ----------

export async function createPotluck(form) {
  const me = uid();
  const ref = doc(collection(db, 'potlucks'));
  const code = normalizeInviteCode(form.inviteCode);
  const codeRef = doc(db, 'inviteCodes', code);
  if ((await getDoc(codeRef)).exists()) throw new Error(`The invite code ${code} is taken. Generate a new one.`);
  const batch = writeBatch(db);
  batch.set(ref, newPotluckDoc({ ...form, inviteCode: code, coverImage: null }, me));
  batch.set(codeRef, { potluckId: ref.id, hostId: me, createdAt: serverTimestamp() });
  await batch.commit();
  if (form.coverData) {
    // Images live under the potluck, so they can only be added once it exists.
    const coverImage = await uploadImage(ref.id, form.coverData);
    await updateDoc(ref, { coverImage, updatedAt: serverTimestamp() });
  }
  return ref.id;
}

export async function updatePotluck(potluck, form) {
  let coverImage = form.coverImage ?? null;
  if (form.coverData) {
    coverImage = await uploadImage(potluck.id, form.coverData);
    if (potluck.coverImage) deleteImage(potluck.coverImage);
  }
  await updateDoc(doc(db, 'potlucks', potluck.id), potluckFields({ ...form, coverImage }));
}

/** Looks up an invite code and returns the potluck (or null). */
export async function lookupInvite(rawCode) {
  const code = normalizeInviteCode(rawCode);
  if (!code) return null;
  const invite = await getDoc(doc(db, 'inviteCodes', code));
  if (!invite.exists()) return null;
  const p = await getDoc(doc(db, 'potlucks', invite.data().potluckId));
  return p.exists() ? { id: p.id, ...p.data() } : null;
}

export function joinPotluck(potluckId) {
  return updateDoc(doc(db, 'potlucks', potluckId), { memberIds: arrayUnion(uid()) });
}

export async function leavePotluck(potluckId) {
  const me = uid();
  const dishRef = doc(db, 'potlucks', potluckId, 'dishes', me);
  const dish = await getDoc(dishRef);
  if (dish.exists()) await deleteDish(potluckId, { id: me, ...dish.data() });
  await updateDoc(doc(db, 'potlucks', potluckId), { memberIds: arrayRemove(me) });
}

export function removeGuest(potluckId, guestId) {
  return updateDoc(doc(db, 'potlucks', potluckId), { memberIds: arrayRemove(guestId) });
}

export async function deletePotluck(potluck) {
  const dishes = await getDocs(collection(db, 'potlucks', potluck.id, 'dishes'));
  await Promise.all(dishes.docs.map((d) => deleteDoc(d.ref)));
  if (potluck.coverImage) await deleteImage(potluck.coverImage);
  await deleteDoc(doc(db, 'inviteCodes', potluck.inviteCode)).catch(() => {});
  await deleteDoc(doc(db, 'potlucks', potluck.id));
}

export function openVoting(potluck) {
  const closesAt = toMillis(potluck.votingClosesAt);
  return updateDoc(doc(db, 'potlucks', potluck.id), {
    status: 'voting',
    // A closing time already in the past would end voting immediately.
    ...(closesAt && closesAt <= Date.now() ? { votingClosesAt: null } : {}),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Closes voting and records the podium. The podium backs the winners' profile
 * frames, so rules only let it be written as part of closing.
 */
export async function publishResults(potluck) {
  const snap = await getDocs(collection(db, 'potlucks', potluck.id, 'dishes'));
  const ranked = rankDishes(snap.docs.map((d) => ({ id: d.id, ...d.data() })), potluck.scoring);
  await updateDoc(doc(db, 'potlucks', potluck.id), {
    status: 'closed',
    podium: podiumFrom(ranked),
    results: { ...resultsSummary(ranked, potluck.memberIds.length), publishedAt: serverTimestamp() },
    updatedAt: serverTimestamp(),
  });
}

// ---------- dishes ----------

export async function saveDish(potluckId, form, existing) {
  const me = uid();
  const values = { ...form };
  for (const key of ['photo', 'recipePhoto']) {
    const pending = form[`${key}Data`];
    if (pending) {
      values[key] = await uploadImage(potluckId, pending);
      if (existing?.[key]) deleteImage(existing[key]);
    } else if (form[key] === null && existing?.[key]) {
      deleteImage(existing[key]);
    }
  }
  const ref = doc(db, 'potlucks', potluckId, 'dishes', me);
  if (existing) await updateDoc(ref, dishFields(values));
  else await setDoc(ref, newDishDoc(values, { uid: me, potluckId }));
}

export async function deleteDish(potluckId, dish) {
  await deleteDoc(doc(db, 'potlucks', potluckId, 'dishes', dish.id));
  if (dish.photo) await deleteImage(dish.photo);
  if (dish.recipePhoto) await deleteImage(dish.recipePhoto);
}

export function toggleLike(potluckId, dishId, liked) {
  return updateDoc(doc(db, 'potlucks', potluckId, 'dishes', dishId), {
    likedBy: liked ? arrayRemove(uid()) : arrayUnion(uid()),
  });
}

/** Anonymous vote: private rating doc + aggregate increment, committed atomically. */
export function submitRating(potluckId, dishId, scores) {
  const w = voteWrites({ uid: uid(), dishId, scores });
  const batch = writeBatch(db);
  batch.set(doc(db, 'potlucks', potluckId, 'ratings', w.ratingId), w.rating);
  batch.update(doc(db, 'potlucks', potluckId, 'dishes', dishId), w.dishPatch);
  return batch.commit();
}

/** Every dish from every potluck the user attended (the recipe bank). */
export async function loadRecipeBank(potlucks) {
  const lists = await Promise.all(potlucks.map(async (p) => {
    const snap = await getDocs(collection(db, 'potlucks', p.id, 'dishes'));
    return snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }), potluck: p }));
  }));
  return lists.flat();
}

// ---------- account ----------

export async function deleteMyData() {
  const me = uid();
  await deleteDoc(doc(db, 'publicProfiles', me));
  await deleteDoc(doc(db, 'users', me));
}
