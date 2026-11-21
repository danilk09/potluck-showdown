import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../../hooks/AuthContext';
import { useDishes, usePotluck } from '../../../../hooks/useFirestore';
import { deleteDish, friendlyError, saveDish } from '../../../../data/api';
import { COMMON_ALLERGENS, DIETARY_LABELS, formatInfo } from '../../../../lib/formats';
import { dietaryConflicts } from '../../../../lib/dietary';
import { toList } from '../../../../data/builders';
import { phaseOf } from '../../../../lib/phase';
import Avatar from '../../../../components/Avatar';
import PhotoPicker from '../../../../components/PhotoPicker';
import {
  Button, Checkbox, ChipToggleGroup, EmptyState, Field, Hint, Input, Label, LoadingScreen, PageHeader, RequiredNote, Row, Screen,
  SelectField, Stack, Tile, useConfirm, useFormError, useToast,
} from '../../../../components/ui';
import { colors, type } from '../../../../theme';

const blank = {
  name: '',
  categoryId: '',
  serves: '',
  ingredients: '',
  steps: '',
  allergens: [] as string[],
  dietary: [] as string[],
  prepMinutes: '',
  calories: '',
  protein: '',
  photo: null as string | null,
  photoData: null as string | null,
  recipePhoto: null as string | null,
  recipePhotoData: null as string | null,
  usedRequired: false,
};

function fromDish(d: any) {
  return {
    ...blank,
    ...d,
    ingredients: (d.ingredients ?? []).join('\n'),
    // Older dishes stored text like "6 people"; the field now takes just the number.
    serves: String(d.serves ?? '').match(/\d+/)?.[0] ?? '',
    prepMinutes: d.prepMinutes != null ? String(d.prepMinutes) : '',
    calories: d.calories != null ? String(d.calories) : '',
    protein: d.protein != null ? String(d.protein) : '',
  };
}

export default function DishForm() {
  const { pid, did, cat } = useLocalSearchParams<{ pid: string; did?: string; cat?: string }>();
  const { user } = useAuth();
  const { data: potluck, loading } = usePotluck(pid);
  const uid = user?.uid || '';
  const isMember = Boolean(potluck?.memberIds.includes(uid));
  const { data: dishes, loading: dishesLoading } = useDishes(pid, isMember);

  if (loading || (isMember && dishesLoading)) return <LoadingScreen />;
  if (!potluck || !isMember) return <Screen><PageHeader title="Add your dish" /><EmptyState title="Join this potluck first" /></Screen>;
  if (phaseOf(potluck) !== 'open') {
    return (
      <Screen>
        <PageHeader title="Add your dish" />
        <EmptyState emoji="🔒" title="Dishes are locked" action={<Button title="Back to event" onPress={() => router.back()} />}>
          Voting has started, so dishes can’t be added or changed anymore.
        </EmptyState>
      </Screen>
    );
  }
  const existing = did ? dishes.find((d: any) => d.id === did && d.authorId === uid) : null;
  if (did && !existing) return <Screen><PageHeader title="Edit dish" /><EmptyState title="Dish not found" /></Screen>;
  return <DishEditor key={existing?.id ?? 'new'} potluck={potluck} dishes={dishes} existing={existing} categoryId={cat} />;
}

function DishEditor({ potluck, dishes, existing, categoryId }: { potluck: any; dishes: any[]; existing: any; categoryId?: string }) {
  const pid = potluck.id;
  const { user, profile } = useAuth();
  const toast = useToast();
  const [confirmEl, confirm] = useConfirm();
  const [form, setForm] = useState(() => {
    if (existing) return fromDish(existing);
    // Opened from a category's "Claim" button: start with that category picked.
    const valid = potluck.dishCategories.some((c: any) => c.id === categoryId);
    return { ...blank, categoryId: valid ? categoryId! : '' };
  });
  const [problemEl, showProblem] = useFormError();
  // Set after a submit attempt, so empty required fields show a red outline.
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [extraAllergen, setExtraAllergen] = useState('');
  const [extraDietary, setExtraDietary] = useState('');

  const uid = user?.uid || '';
  const fmt = formatInfo(potluck.format);
  const set = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));
  const field = (key: string) => ({ value: (form as any)[key], onChangeText: (v: string) => set(key, v) });
  const counts = Object.fromEntries(potluck.dishCategories.map((c: any) => [c.id, dishes.filter((d: any) => d.categoryId === c.id && d.id !== existing?.id).length]));
  const needsRequired = potluck.format === 'mystery' && potluck.formatDetail;
  const aiCategories = potluck.scoring.filter((c: any) => c.mode === 'ai');

  const missing = [
    !form.name.trim() && 'Dish name',
    !form.categoryId && (potluck.format === 'courses' ? 'Bracket' : 'Category'),
    !form.ingredients.trim() && 'Ingredients',
    needsRequired && !form.usedRequired && 'Confirm you used every required ingredient',
  ].filter(Boolean) as string[];

  const persist = async () => {
    setBusy(true);
    try {
      const id = await saveDish(pid, form, existing, aiCategories.length > 0);
      toast(existing ? 'Dish updated' : 'Dish added! 🎉');
      // With AI scoring, open the dish so its new health score is the first thing they see.
      if (aiCategories.length) router.replace(`/potlucks/${pid}/dishes/${id}` as any);
      else router.back();
    } catch (err) {
      showProblem({ title: 'Couldn’t save your dish', message: friendlyError(err) });
      setBusy(false);
    }
  };

  const submit = async () => {
    if (busy) return;
    if (missing.length) {
      setChecked(true);
      showProblem({ missing });
      return;
    }
    const clashes = dietaryConflicts(toList(form.ingredients), form.dietary);
    if (clashes.length && !(await confirm({
      title: 'Check your dietary labels',
      body: clashes.map((c) => `“${c.label}” but the ingredients include ${c.word}.`).join('\n'),
      confirmLabel: 'Save anyway',
    }))) return;
    void persist();
  };

  const remove = async () => {
    if (!(await confirm({ title: 'Remove your dish?', body: 'This frees up your spot so you can pick a different dish.', confirmLabel: 'Remove', danger: true }))) return;
    try {
      await deleteDish(pid, existing);
      toast('Dish removed');
      router.back();
    } catch (err) {
      showProblem({ title: 'Couldn’t remove your dish', message: friendlyError(err) });
    }
  };

  const addAllergen = () => {
    const a = extraAllergen.trim();
    if (a && !form.allergens.includes(a)) set('allergens', [...form.allergens, a]);
    setExtraAllergen('');
  };

  const addDietary = () => {
    const d = extraDietary.trim();
    if (d && !form.dietary.includes(d)) set('dietary', [...form.dietary, d]);
    setExtraDietary('');
  };

  return (
    <Screen footer={(
      <Button
        size="lg"
        title={busy ? (aiCategories.length ? 'Calculating health score…' : 'Saving…') : aiCategories.length ? (existing ? 'Calculate & save' : 'Calculate & add dish') : existing ? 'Save Dish' : 'Add Dish'}
        loading={busy}
        onPress={submit}
      />
    )}>
      {confirmEl}
      <PageHeader title={existing ? 'Edit your dish' : 'Add your dish'} actions={<Avatar uid={uid} profile={profile} size={40} />} />

      <Tile tone="peach" style={{ padding: 14, marginBottom: 16 }}>
        <Row gap={10} style={{ marginBottom: 10 }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.coral, alignItems: 'center', justifyContent: 'center' }}>
            <Text>{fmt.emoji}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.small, type.muted]} numberOfLines={1}>{potluck.title}</Text>
            <Text style={[type.body, type.bold]}>How your dish will be judged</Text>
          </View>
        </Row>
        <Stack gap={6}>
          {potluck.scoring.map((c: any) => (
            <Row key={c.id} gap={10} align="flex-start">
              <Text style={[type.body, type.heavy, { width: 48 }]}>{c.weight}%</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.body, type.bold]}>{c.name}</Text>
                <Text style={[type.small, type.muted]}>{c.mode === 'ai' ? 'AI scores it from your ingredients when you save' : 'Guests rate it 1–5 stars'}</Text>
              </View>
            </Row>
          ))}
        </Stack>
        {potluck.formatDetail ? <Text style={[type.small, { marginTop: 8 }]}><Text style={type.bold}>{fmt.detailLabel}:</Text> {potluck.formatDetail}</Text> : null}
      </Tile>

      {problemEl}
      <RequiredNote style={{ marginBottom: 12 }} />
      <Stack gap={16}>
        <Field label="Dish name" required invalid={checked && !form.name.trim()} {...field('name')} maxLength={80} placeholder="Spicy sesame noodles" />
        <Row gap={12} align="flex-start">
          <SelectField
            style={{ flex: 7 }}
            label={potluck.format === 'courses' ? 'Course' : 'Category'}
            required
            value={form.categoryId}
            onChange={(v) => set('categoryId', v)}
            options={potluck.dishCategories.map((c: any) => {
              const left = c.needed - counts[c.id];
              return { value: c.id, label: c.name, sub: left > 0 ? `${left} needed` : 'Full' };
            })}
          />
          <Field style={{ flex: 5 }} label="Serves" keyboardType="number-pad" inputMode="numeric" maxLength={3} placeholder="8"
            value={form.serves} onChangeText={(v) => set('serves', v.replace(/\D/g, ''))} />
        </Row>

        <PhotoPicker title="Add a photo of your dish" current={form.photo} pending={form.photoData}
          onPick={(d) => set('photoData', d)} onRemove={() => setForm((f: any) => ({ ...f, photo: null, photoData: null }))} />

        <Field label="Ingredients" required
          invalid={checked && !form.ingredients.trim()} {...field('ingredients')} rows={4}
          placeholder={'One per line, or separated by commas\n8 oz wheat noodles\n2 tbsp sesame paste'} />
        {needsRequired && (
          <Tile tone="gold" style={{ padding: 14 }}>
            <Checkbox checked={form.usedRequired} onChange={(v) => set('usedRequired', v)}>
              <Text style={type.body}>My dish uses every required ingredient: <Text style={type.bold}>{potluck.formatDetail}</Text></Text>
            </Checkbox>
          </Tile>
        )}

        <View>
          <Label>Recipe steps</Label>
          <Input {...field('steps')} rows={5} maxLength={8000} placeholder="1. Boil the noodles…" accessibilityLabel="Recipe" />
        </View>
        <PhotoPicker compact title="Or upload a photo of a recipe card" current={form.recipePhoto} pending={form.recipePhotoData}
          onPick={(d) => set('recipePhotoData', d)} onRemove={() => setForm((f: any) => ({ ...f, recipePhoto: null, recipePhotoData: null }))} />

        <Row gap={12} align="flex-start">
          <Field style={{ flex: 1 }} label="Prep (min)" keyboardType="number-pad" placeholder="30"
            value={form.prepMinutes} onChangeText={(v) => set('prepMinutes', v.replace(/\D/g, ''))} />
          <Field style={{ flex: 1 }} label="Calories" keyboardType="number-pad" placeholder="per serving"
            value={form.calories} onChangeText={(v) => set('calories', v.replace(/\D/g, ''))} />
          <Field style={{ flex: 1 }} label="Protein (g)" keyboardType="number-pad" placeholder="per serving"
            value={form.protein} onChangeText={(v) => set('protein', v.replace(/\D/g, ''))} />
        </Row>

        <View>
          <Label>Allergens</Label>
          <ChipToggleGroup warn options={[...new Set([...COMMON_ALLERGENS, ...form.allergens])]} value={form.allergens} onChange={(v) => set('allergens', v)} />
          <Row gap={8} style={{ marginTop: 8, maxWidth: 360 }}>
            <Input style={{ flex: 1, paddingVertical: 8 }} placeholder="Other allergen" accessibilityLabel="Other allergen" value={extraAllergen}
              onChangeText={setExtraAllergen} returnKeyType="done" onSubmitEditing={addAllergen} blurOnSubmit={false} />
            <Button size="sm" variant="outline" title="Add" onPress={addAllergen} />
          </Row>
        </View>
        <View>
          <Label>Dietary labels</Label>
          <ChipToggleGroup options={[...new Set([...DIETARY_LABELS, ...form.dietary])]} value={form.dietary} onChange={(v) => set('dietary', v)} />
          <Row gap={8} style={{ marginTop: 8, maxWidth: 360 }}>
            <Input style={{ flex: 1, paddingVertical: 8 }} placeholder="Other dietary label" accessibilityLabel="Other dietary label" value={extraDietary}
              onChangeText={setExtraDietary} returnKeyType="done" onSubmitEditing={addDietary} blurOnSubmit={false} />
            <Button size="sm" variant="outline" title="Add" onPress={addDietary} />
          </Row>
        </View>

        {missing.length === 0
          ? <Tile tone="mint" style={{ paddingVertical: 10, paddingHorizontal: 14 }}><Text style={[type.small, { color: colors.mintDark }]}>✓ All required details are complete.</Text></Tile>
          : <Hint>Still needed: {missing.join(', ').toLowerCase()}.</Hint>}

        {existing && <Button variant="linkDanger" title="Remove my dish" onPress={remove} />}
      </Stack>
    </Screen>
  );
}
