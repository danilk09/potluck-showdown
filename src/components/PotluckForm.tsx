import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Slider from "@react-native-community/slider";
import { useAuth } from "../hooks/AuthContext";
import { usePotluck } from "../hooks/useFirestore";
import { createPotluck, friendlyError, updatePotluck } from "../data/api";
import { DEFAULT_SCORING, FORMATS, FORMAT_KEYS, MAX_SCORING, SCORING_SUGGESTIONS, formatInfo } from "../lib/formats";
import { generateInviteCode, isValidInviteCode, normalizeInviteCode } from "../lib/inviteCode";
import { supportsAiScoring } from "../lib/healthScore";
import { weightsTotal } from "../lib/scoring";
import { phaseOf } from "../lib/phase";
import { toInputDate, toInputDateTime, toInputTime } from "../lib/dates";
import DateTimeField from "./DateTimeField";
import { missingTime, todayValue } from "./dateTimeValue";
import { localDateTime } from "../data/builders";
import { HealthScoreModal } from "./HealthScoreMeter";
import PhotoPicker from "./PhotoPicker";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  Hint,
  IconButton,
  Input,
  Label,
  LoadingScreen,
  OptionSheet,
  PageHeader,
  RequiredNote,
  Row,
  Screen,
  Stack,
  hasProblem,
  useFormError,
  useToast,
  type FormProblem,
} from "./ui";
import { colors, type } from "../theme";

const DRAFT_KEY = "ps-potluck-drafts-v2";
const LEGACY_DRAFT_KEY = "ps-potluck-draft";
const newId = () => `k${Math.random().toString(36).slice(2, 8)}`;
const categoriesFor = (format: string) =>
  formatInfo(format).defaultCategories.map((name) => ({ id: newId(), name, needed: 3 }));

function blankForm() {
  return {
    title: "",
    date: "",
    time: "18:30",
    location: "",
    format: "classic",
    formatDetail: "",
    theme: "",
    description: "",
    inviteCode: generateInviteCode(),
    // Sliders start at 0%; the host spreads the 100% across categories.
    scoring: DEFAULT_SCORING.map((c) => ({ ...c, weight: 0 })),
    dishCategories: categoriesFor("classic"),
    maxGuests: "",
    votingOpensAt: "",
    votingClosesAt: "",
    coverImage: null,
    coverData: null,
    prizes: ["", "", ""],
  };
}

async function loadDrafts(userId: string) {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(`${DRAFT_KEY}-${userId}`)) || "null");
    if (Array.isArray(saved)) return saved;
    const old = JSON.parse((await AsyncStorage.getItem(LEGACY_DRAFT_KEY)) || "null");
    if (old) {
      const migrated = [{ id: newId(), updatedAt: Date.now(), form: old }];
      await AsyncStorage.setItem(`${DRAFT_KEY}-${userId}`, JSON.stringify(migrated));
      await AsyncStorage.removeItem(LEGACY_DRAFT_KEY);
      return migrated;
    }
    return [];
  } catch {
    return [];
  }
}

function fromPotluck(p: any) {
  return {
    title: p.title,
    date: toInputDate(p.startsAt),
    time: toInputTime(p.startsAt),
    location: p.location ?? "",
    format: p.format,
    formatDetail: p.formatDetail ?? "",
    theme: p.theme ?? "",
    description: p.description ?? "",
    inviteCode: p.inviteCode,
    scoring: (p.scoring || []).map((c: any) => ({ ...c })),
    dishCategories: (p.dishCategories || []).map((c: any) => ({ ...c })),
    maxGuests: p.maxGuests ? String(p.maxGuests) : "",
    votingOpensAt: toInputDateTime(p.votingOpensAt),
    votingClosesAt: toInputDateTime(p.votingClosesAt),
    coverImage: p.coverImage ?? null,
    coverData: null,
    prizes: [0, 1, 2].map((i) => p.prizes?.[i] ?? ""),
  };
}

function Notice({ heading, emoji, children }: { heading: string; emoji?: string; children?: React.ReactNode }) {
  return (
    <Screen>
      <PageHeader title="Edit potluck" />
      <EmptyState emoji={emoji} title={heading}>
        {children}
      </EmptyState>
    </Screen>
  );
}

export default function PotluckForm({ pid }: { pid?: string }) {
  const editing = Boolean(pid);
  const { data: existing, loading } = usePotluck(pid);
  const { user, isGuest } = useAuth();

  if (isGuest) {
    return (
      <Screen>
        <PageHeader title="Create a potluck" />
        <EmptyState
          emoji="🔐"
          title="Hosting needs a free account"
          action={<Button title="Save your account" onPress={() => router.replace("/profile")} />}
        >
          Guests can join and vote. To host your own showdown, turn your guest pass into an account. You’ll keep
          everything you’ve joined.
        </EmptyState>
      </Screen>
    );
  }
  if (editing && loading) return <LoadingScreen />;
  if (editing && !existing) return <Notice heading="Potluck not found" />;
  if (editing && existing?.hostId !== user?.uid) return <Notice heading="Only the host can edit this potluck" />;
  if (editing && existing?.status === "closed") {
    return (
      <Notice heading="Results are final" emoji="🏁">
        This showdown is over, so it can’t be edited.
      </Notice>
    );
  }
  return <PotluckEditor key={pid ?? "new"} existing={editing ? existing : null} userId={user?.uid || ""} />;
}

function PotluckEditor({ existing, userId }: { existing: any; userId: string }) {
  const editing = Boolean(existing);
  const toast = useToast();
  const [form, setForm] = useState<any>(() => (editing ? fromPotluck(existing) : blankForm()));
  const [drafts, setDrafts] = useState<any[]>([]);
  const [draftId, setDraftId] = useState(() => newId());
  const [draftsReady, setDraftsReady] = useState(false);
  const [draftMenu, setDraftMenu] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);
  const draftWrites = useRef(Promise.resolve());
  const [step, setStep] = useState(1);
  const [categoriesTouched, setCategoriesTouched] = useState(false);
  const [codeTouched, setCodeTouched] = useState(false);
  const [addMenu, setAddMenu] = useState(false);
  const [scorePreview, setScorePreview] = useState<string | null>(null);
  // Set after a submit attempt, so empty required fields show a red outline.
  const [checked, setChecked] = useState(false);
  const [problemEl, showProblem] = useFormError();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (editing) return undefined;
    let alive = true;
    loadDrafts(userId).then((items) => {
      if (alive) {
        setDrafts(items);
        setDraftsReady(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [editing, userId]);

  useEffect(() => {
    if (editing || !draftsReady || draftSaved) return undefined;
    if (!draftDirty) return undefined;
    const timer = setTimeout(() => {
      const item = { id: draftId, updatedAt: Date.now(), form };
      setDrafts((current) => [item, ...current.filter((d) => d.id !== draftId)]);
    }, 0);
    return () => clearTimeout(timer);
  }, [draftId, draftDirty, draftsReady, draftSaved, editing, form]);

  useEffect(() => {
    if (editing || !draftsReady) return;
    draftWrites.current = draftWrites.current
      .catch(() => {})
      .then(() => AsyncStorage.setItem(`${DRAFT_KEY}-${userId}`, JSON.stringify(drafts)));
    draftWrites.current.catch(() => toast("Could not save draft", "danger"));
  }, [drafts, draftsReady, editing, toast, userId]);

  const scoringLocked = editing && phaseOf(existing) !== "open";
  const editForm = (update: (f: any) => any) => {
    setDraftDirty(true);
    setForm(update);
  };
  const set = (key: string, value: any) => editForm((f) => ({ ...f, [key]: value }));
  const field = (key: string) => ({ value: form[key], onChangeText: (v: string) => set(key, v) });
  const fmt = formatInfo(form.format);
  const total = weightsTotal(form.scoring);

  const setScoring = (i: number, patch: any) =>
    set(
      "scoring",
      form.scoring.map((c: any, j: number) => (j === i ? { ...c, ...patch } : c))
    );
  const addScoring = (s?: any) => {
    set("scoring", [
      ...form.scoring,
      { id: `c${form.scoring.length}`, name: s?.name ?? "", description: s?.description ?? "", weight: 0 },
    ]);
  };
  // A slider can only use the percentage the other categories haven't taken.
  const availableFor = (i: number) => 100 - (total - (Number(form.scoring[i].weight) || 0));
  const setWeight = (i: number, value: number) =>
    setScoring(i, { weight: Math.max(0, Math.min(availableFor(i), Math.round(value))) });
  const setCategory = (i: number, patch: any) => {
    setCategoriesTouched(true);
    set(
      "dishCategories",
      form.dishCategories.map((c: any, j: number) => (j === i ? { ...c, ...patch } : c))
    );
  };

  const chooseFormat = (key: string) => {
    editForm((f) => ({
      ...f,
      format: key,
      ...(!editing && !categoriesTouched ? { dishCategories: categoriesFor(key) } : {}),
    }));
  };

  const openDraft = (draft: any) => {
    setDraftId(draft.id);
    setForm({ ...blankForm(), ...draft.form });
    setDraftDirty(false);
    setStep(1);
    setChecked(false);
  };

  const newDraft = () => {
    setDraftId(newId());
    setForm(blankForm());
    setDraftDirty(false);
    setStep(1);
    setChecked(false);
  };

  const removeDraft = async () => {
    const next = drafts.filter((d) => d.id !== draftId);
    setDrafts(next);
    draftWrites.current = draftWrites.current
      .catch(() => {})
      .then(() => AsyncStorage.setItem(`${DRAFT_KEY}-${userId}`, JSON.stringify(next)));
    await draftWrites.current;
    newDraft();
  };

  // An existing event keeps its date even if it has passed; new or changed dates must be today or later.
  const dateChanged = !editing || form.date !== toInputDate(existing.startsAt);
  const validateStep1 = (): FormProblem => {
    const missing: string[] = [];
    const problems: string[] = [];
    if (!form.title.trim()) missing.push("Challenge title");
    if (!form.date) missing.push("Date");
    if (!form.time) missing.push("Time (type it like 6:30)");
    if (fmt.detailLabel && !form.formatDetail.trim()) missing.push(fmt.detailLabel);
    if (!editing && !form.inviteCode.trim()) missing.push("Invite code");
    const unnamed = form.scoring.filter((c: any) => !c.name.trim()).length;
    if (unnamed) missing.push(unnamed === 1 ? "Scoring category name" : `${unnamed} scoring category names`);

    if (form.date && dateChanged && form.date < todayValue()) problems.push("The date has passed. Pick today or a later date.");
    else if (form.date && form.time && dateChanged && (localDateTime(form.date, form.time)?.getTime() ?? 0) < Date.now())
      problems.push("That start time has already passed. Pick a later time.");
    if (!editing && form.inviteCode.trim() && !isValidInviteCode(normalizeInviteCode(form.inviteCode)))
      problems.push("Invite codes use 4–20 letters, numbers, or dashes.");
    if (total !== 100) problems.push(`Scoring weights add up to ${total}%. Move the sliders so they total exactly 100%.`);
    return { missing, problems };
  };

  const validateStep2 = (): FormProblem => {
    const missing: string[] = [];
    const problems: string[] = [];
    if (!form.dishCategories.some((c: any) => c.name.trim())) missing.push("At least one dish category");
    if (missingTime(form.votingOpensAt)) missing.push("Time voting opens (type it like 7:00)");
    if (missingTime(form.votingClosesAt)) missing.push("Time voting closes (type it like 9:00)");
    if (form.votingOpensAt && form.votingClosesAt && form.votingClosesAt <= form.votingOpensAt)
      problems.push("Voting must close after it opens.");
    const guests = parseInt(form.maxGuests, 10);
    if (editing && guests && guests < existing.memberIds.length)
      problems.push(`The guest limit is below the ${existing.memberIds.length} people already going.`);
    return { missing, problems };
  };

  const next = () => {
    const problem = validateStep1();
    if (hasProblem(problem)) {
      setChecked(true);
      showProblem(problem);
      return;
    }
    setStep(2);
  };

  const submit = async () => {
    const first = validateStep1();
    if (hasProblem(first)) {
      // Something on the first page needs fixing (a start time can pass while you fill in page 2).
      setChecked(true);
      setStep(1);
      showProblem(first);
      return;
    }
    const second = validateStep2();
    if (hasProblem(second)) {
      setChecked(true);
      showProblem(second);
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await updatePotluck(existing, form);
        toast("Potluck updated");
        router.back();
      } else {
        const id = await createPotluck(form);
        setDraftSaved(true);
        await removeDraft();
        router.replace({ pathname: "/potlucks/[pid]", params: { pid: id, invite: "new" } } as any);
      }
    } catch (err: any) {
      showProblem({ title: editing ? "Couldn’t save your changes" : "Couldn’t create the potluck", message: friendlyError(err) });
      setBusy(false);
    }
  };

  const footer =
    step === 1 ? (
      <Button size="lg" title="Next: dishes & voting" onPress={next} />
    ) : (
      <Button
        size="lg"
        title={busy ? "Saving…" : editing ? "Save changes" : "Create Challenge"}
        loading={busy}
        onPress={submit}
      />
    );

  return (
    <Screen key={step} footer={footer}>
      <PageHeader
        title={editing ? "Edit potluck" : "Create a potluck"}
        actions={
          !editing && (
            <Button variant="link" title={`Drafts (${drafts.length})`} onPress={() => setDraftMenu(true)} />
          )
        }
      />
      {!editing && (
        <OptionSheet
          visible={draftMenu}
          onClose={() => setDraftMenu(false)}
          title="Your planned potlucks"
          options={[
            { label: "Start a new potluck", icon: "add-circle-outline", onPress: newDraft },
            ...drafts.map((d) => ({
              key: d.id,
              label: d.form.title?.trim() || "Untitled potluck",
              sub: d.form.date || "Date not set",
              selected: d.id === draftId,
              onPress: () => openDraft(d),
            })),
            ...(drafts.some((d) => d.id === draftId)
              ? [{ label: "Delete this draft", icon: "trash-outline", danger: true, onPress: removeDraft }]
              : []),
          ]}
        />
      )}
      {!editing && (
        <Text style={[type.small, type.muted, { marginBottom: 8 }]}>
          Changes to this potluck save as a draft automatically on this device.
        </Text>
      )}
      {step === 2 && (
        <Button
          variant="link"
          icon="chevron-back"
          title="Challenge setup"
          style={{ alignSelf: "flex-start" }}
          onPress={() => setStep(1)}
        />
      )}
      <Text style={s.step}>
        {step === 1 ? "Challenge setup" : "Dishes & voting"} · {step} of 2
      </Text>
      {problemEl}
      <RequiredNote style={{ marginBottom: 12 }} />

      {step === 1 ? (
        <Stack gap={16}>
          <Field
            label="Challenge title"
            required
            invalid={checked && !form.title.trim()}
            value={form.title}
            onChangeText={(title) => {
              editForm((f) => ({
                ...f,
                title,
                ...(!editing && !codeTouched
                  ? { inviteCode: `${generateInviteCode(title).split("-")[0]}-${f.inviteCode.split("-").pop()}` }
                  : {}),
              }));
            }}
            maxLength={80}
            placeholder="Healthy Harvest Cook-Off"
          />
          <Row gap={12} align="flex-start">
            <DateTimeField
              style={{ flex: 1 }}
              label="Date"
              required
              mode="date"
              value={form.date}
              minDate={todayValue()}
              onChange={(v) => set("date", v)}
              placeholder="Pick a date"
            />
            <DateTimeField
              style={{ flex: 1 }}
              label="Time"
              required
              mode="time"
              value={form.time}
              onChange={(v) => set("time", v)}
            />
          </Row>
          <Field label="Location" {...field("location")} maxLength={160} placeholder="Hawthorne Hall rooftop" />

          <View>
            <Label>Competition format</Label>
            <View style={s.formats} accessibilityRole="radiogroup">
              {FORMAT_KEYS.map((key) => {
                const on = form.format === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => chooseFormat(key)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    style={[s.format, on && s.formatOn]}
                  >
                    <Text style={{ fontSize: 24 }}>{FORMATS[key].emoji}</Text>
                    <Text style={[type.body, type.bold]}>{FORMATS[key].label}</Text>
                    <Text style={[type.small, type.muted]}>{FORMATS[key].blurb}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {fmt.detailLabel && (
            <Field
              label={fmt.detailLabel}
              required
              invalid={checked && !form.formatDetail.trim()}
              {...field("formatDetail")}
              maxLength={300}
              placeholder={fmt.detailPlaceholder}
            />
          )}
          <Field label="Challenge theme" {...field("theme")} maxLength={120} placeholder="Plant-based comfort food" />
          <Field
            label="Description"
            {...field("description")}
            rows={3}
            maxLength={1000}
            placeholder="Bring a shareable, healthy dish and compete for the tastiest, most nutritious plate."
          />

          {!editing && (
            <View>
              <Label required>Invite code</Label>
              <Row gap={8}>
                <Input
                  style={[{ flex: 1 }, type.code]}
                  value={form.inviteCode}
                  invalid={checked && !isValidInviteCode(normalizeInviteCode(form.inviteCode))}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  accessibilityLabel="Invite code"
                  onChangeText={(v) => {
                    setCodeTouched(true);
                    set("inviteCode", normalizeInviteCode(v));
                  }}
                />
                <Button
                  variant="outline"
                  title="Generate"
                  onPress={() => set("inviteCode", generateInviteCode(form.title))}
                />
              </Row>
              <Hint>Guests type this code or open your invite link to join.</Hint>
            </View>
          )}

          <View>
            <Row justify="space-between" style={{ marginBottom: 6 }}>
              <Text style={[type.body, type.bold]}>
                Scoring categories <Text style={{ color: colors.danger }}>*</Text>
              </Text>
              <Text style={[type.small, type.bold, { color: total === 100 ? colors.mint : colors.danger }]}>
                {total}% of 100%
              </Text>
            </Row>
            {!scoringLocked && total < 100 && (
              <Text style={[type.small, type.muted, { marginBottom: 6 }]}>{100 - total}% left to assign.</Text>
            )}
            {scoringLocked && (
              <Banner tone="warning" style={{ marginBottom: 8 }}>
                Voting has started, so scoring can’t change.
              </Banner>
            )}
            <Stack gap={8}>
              {form.scoring.map((c: any, i: number) => (
                <Card key={i} style={{ padding: 14 }}>
                  <Row gap={8} align="flex-start">
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Input
                        style={s.bare}
                        value={c.name}
                        editable={!scoringLocked}
                        maxLength={30}
                        placeholder="Category name"
                        accessibilityLabel="Category name"
                        onChangeText={(v) =>
                          setScoring(i, supportsAiScoring(v) ? { name: v } : { name: v, mode: "manual" })
                        }
                      />
                      <Input
                        style={[s.bare, { fontWeight: "400", fontSize: 14, color: colors.muted }]}
                        value={c.description}
                        editable={!scoringLocked}
                        maxLength={100}
                        placeholder={c.mode === "ai" ? "Shown beside the calculated score" : "What should voters judge?"}
                        accessibilityLabel="Category description"
                        onChangeText={(v) => setScoring(i, { description: v })}
                      />
                    </View>
                    <Text style={[type.body, type.bold, { minWidth: 44, textAlign: "right" }]}>{c.weight}%</Text>
                    {form.scoring.length > 1 && !scoringLocked && (
                      <IconButton
                        name="trash-outline"
                        color={colors.danger}
                        accessibilityLabel={`Remove ${c.name}`}
                        onPress={() => set("scoring", form.scoring.filter((_: any, j: number) => j !== i))}
                      />
                    )}
                  </Row>
                  <Slider
                    style={{ marginTop: 6, height: 36 }}
                    minimumValue={0}
                    maximumValue={100}
                    upperLimit={availableFor(i)}
                    step={1}
                    value={Number(c.weight) || 0}
                    disabled={scoringLocked}
                    onValueChange={(v) => setWeight(i, v)}
                    minimumTrackTintColor={colors.coral}
                    maximumTrackTintColor={colors.line}
                    thumbTintColor={colors.coral}
                    accessibilityLabel={`${c.name || "Category"} weight`}
                  />
                  <Text style={[type.small, type.muted]}>
                    {scoringLocked ? "" : `Up to ${availableFor(i)}% available for this category`}
                  </Text>
                  {supportsAiScoring(c.name) && (
                    <View style={{ marginTop: 10 }}>
                      <Text style={[type.small, type.muted, { marginBottom: 6 }]}>How healthiness is scored</Text>
                      <Row gap={8} align="stretch">
                        {(
                          [
                            ["manual", "Manual", "Guests give stars"],
                            ["ai", "AI calculated", "Scored for each dish"],
                          ] as const
                        ).map(([mode, label, sub]) => {
                          const on = (c.mode === "ai" ? "ai" : "manual") === mode;
                          return (
                            <Pressable
                              key={mode}
                              disabled={scoringLocked}
                              accessibilityRole="radio"
                              accessibilityState={{ selected: on, disabled: scoringLocked }}
                              accessibilityLabel={`${label}. ${sub}`}
                              onPress={() => setScoring(i, { mode })}
                              style={[
                                s.modeBtn,
                                on && (mode === "ai" ? s.modeAi : s.modeManual),
                                scoringLocked && { opacity: 0.55 },
                              ]}
                            >
                              <Text style={[type.small, type.bold]}>{label}</Text>
                              <Text style={[type.small, type.muted]}>{sub}</Text>
                            </Pressable>
                          );
                        })}
                      </Row>
                      {c.mode === "ai" && (
                        <>
                          <Hint>
                            Ingredient amounts and USDA nutrition data determine a score out of 100 when a dish is saved.
                          </Hint>
                          <Button
                            variant="link"
                            icon="sparkles"
                            title="Preview a sample score"
                            style={{ alignSelf: "flex-start" }}
                            onPress={() => setScorePreview(c.name || "Healthiness")}
                          />
                        </>
                      )}
                    </View>
                  )}
                </Card>
              ))}
            </Stack>
            {form.scoring.length < MAX_SCORING && !scoringLocked && (
              <>
                <Button
                  variant="link"
                  icon="add"
                  title="Add category"
                  style={{ alignSelf: "flex-start", marginTop: 8 }}
                  onPress={() => setAddMenu(true)}
                />
                <OptionSheet
                  visible={addMenu}
                  onClose={() => setAddMenu(false)}
                  title="Add a scoring category"
                  options={[
                    ...SCORING_SUGGESTIONS.filter((sg) => !form.scoring.some((c: any) => c.name === sg.name)).map(
                      (sg) => ({ label: sg.name, sub: sg.description, onPress: () => addScoring(sg) })
                    ),
                    { label: "Custom…", icon: "create-outline", onPress: () => addScoring() },
                  ]}
                />
              </>
            )}
          </View>
        </Stack>
      ) : (
        <Stack gap={16}>
          <View>
            <Text style={[type.body, type.bold, { marginBottom: 2 }]}>
              {form.format === "courses" ? "Course brackets" : "Dish categories"}{" "}
              <Text style={{ color: colors.danger }}>*</Text>
            </Text>
            <Text style={[type.small, type.muted, { marginBottom: 8 }]}>
              Guests claim a spot when they add their dish.{" "}
              {form.format === "courses"
                ? "Each bracket gets its own winner."
                : "Each category with votes gets its own winner too."}
            </Text>
            <Stack gap={8}>
              {form.dishCategories.map((c: any, i: number) => (
                <Card
                  key={c.id}
                  style={{
                    paddingVertical: 8,
                    paddingLeft: 14,
                    paddingRight: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Input
                    style={[s.bare, { flex: 1 }]}
                    value={c.name}
                    maxLength={40}
                    placeholder="e.g. Desserts"
                    accessibilityLabel="Category name"
                    onChangeText={(v) => setCategory(i, { name: v })}
                  />
                  <Text style={[type.small, type.muted]}>Need</Text>
                  <Input
                    style={{ width: 52, textAlign: "center", paddingHorizontal: 6 }}
                    keyboardType="number-pad"
                    accessibilityLabel="Dishes needed"
                    value={String(c.needed)}
                    onChangeText={(v) => setCategory(i, { needed: v.replace(/\D/g, "").slice(0, 2) })}
                  />
                  {form.dishCategories.length > 1 && (
                    <IconButton
                      name="trash-outline"
                      color={colors.danger}
                      accessibilityLabel={`Remove ${c.name}`}
                      onPress={() => {
                        setCategoriesTouched(true);
                        set("dishCategories", form.dishCategories.filter((_: any, j: number) => j !== i));
                      }}
                    />
                  )}
                </Card>
              ))}
            </Stack>
            {form.dishCategories.length < 12 && (
              <Button
                variant="link"
                icon="add"
                title="Add category"
                style={{ alignSelf: "flex-start", marginTop: 8 }}
                onPress={() => {
                  setCategoriesTouched(true);
                  set("dishCategories", [...form.dishCategories, { id: newId(), name: "", needed: 2 }]);
                }}
              />
            )}
          </View>

          <Card style={{ padding: 16 }}>
            <Text style={[type.body, type.bold]}>
              Voting schedule <Text style={[type.small, type.muted, { fontWeight: "400" }]}>(optional)</Text>
            </Text>
            <Text style={[type.small, type.muted, { marginTop: 4, marginBottom: 12 }]}>
              Voting opens and closes on its own at these times. You can also open voting and publish results by hand
              from the event page.
            </Text>
            <Stack gap={12}>
              <DateTimeField
                label="Voting opens"
                mode="datetime"
                minDate={todayValue()}
                clearable
                value={form.votingOpensAt}
                disabled={scoringLocked}
                onChange={(v) => set("votingOpensAt", v)}
              />
              <DateTimeField
                label="Voting closes"
                mode="datetime"
                minDate={todayValue()}
                clearable
                value={form.votingClosesAt}
                onChange={(v) => set("votingClosesAt", v)}
              />
            </Stack>
          </Card>

          <Field
            label="Guest limit"
            keyboardType="number-pad"
            placeholder="No limit"
            value={form.maxGuests}
            onChangeText={(v: string) => set("maxGuests", v.replace(/\D/g, ""))}
          />

          <View>
            <Label>Prizes (optional)</Label>
            <Text style={[type.small, type.muted, { marginBottom: 8 }]}>
              Offering something for the winners? Add it here. You provide the prize; Potluck Showdown just shows it to guests.
            </Text>
            <Stack gap={8}>
              {["🥇 1st place", "🥈 2nd place", "🥉 3rd place"].map((place, i) => (
                <Input
                  key={place}
                  maxLength={80}
                  placeholder={`${place} prize, e.g. $20 gift card`}
                  accessibilityLabel={`${place} prize`}
                  value={form.prizes?.[i] ?? ""}
                  onChangeText={(v) => set("prizes", [0, 1, 2].map((j) => (j === i ? v : form.prizes?.[j] ?? "")))}
                />
              ))}
            </Stack>
          </View>

          <View>
            <Label>Cover photo</Label>
            <PhotoPicker
              title="Add a cover photo"
              current={form.coverImage}
              pending={form.coverData}
              onPick={(data) => set("coverData", data)}
              onRemove={() => editForm((f) => ({ ...f, coverData: null, coverImage: null }))}
            />
          </View>
        </Stack>
      )}
      {scorePreview != null && (
        <HealthScoreModal
          title={scorePreview}
          onClose={() => setScorePreview(null)}
        />
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  step: { color: colors.mint, fontWeight: "700", fontSize: 14, marginBottom: 12 },
  formats: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  format: {
    flexGrow: 1,
    flexBasis: "45%",
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    gap: 2,
  },
  formatOn: { borderColor: colors.coral, borderWidth: 2 },
  bare: { borderWidth: 0, paddingHorizontal: 0, paddingVertical: 4, fontWeight: "700", backgroundColor: "transparent" },
  modeBtn: {
    flex: 1,
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    gap: 2,
  },
  modeManual: { borderColor: colors.coral, borderWidth: 2, backgroundColor: colors.peachSoft },
  modeAi: { borderColor: colors.mint, borderWidth: 2, backgroundColor: colors.mintSoft },
});
