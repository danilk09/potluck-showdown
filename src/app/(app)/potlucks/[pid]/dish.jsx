import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../../hooks/AuthContext';
import { useDishes, usePotluck } from '../../../../hooks/useFirestore';
import { deleteDish, friendlyError, saveDish } from '../../../../data/api';
import { COMMON_ALLERGENS, DIETARY_LABELS, formatInfo } from '../../../../lib/formats';
import { phaseOf } from '../../../../lib/phase';
import Avatar from '../../../../components/Avatar';
import PhotoPicker from '../../../../components/PhotoPicker';
import {
  Banner, Button, Card, Checkbox, ChipToggleGroup, EmptyState, Field, Hint, Input, Label, LoadingScreen, PageHeader, Row, Screen,
  SelectField, Stack, Tile, useConfirm, useToast,
} from '../../../../components/ui';
import { colors, type } from '../../../../theme';

const blank = { name: '', categoryId: '', serves: '', ingredients: '', steps: '', allergens: [], dietary: [], prepMinutes: '', calories: '', photo: null, recipePhoto: null, usedRequired: false };

function fromDish(d) {
  return {
    ...blank,
    ...d,
    ingredients: (d.ingredients ?? []).join('\n'),
    prepMinutes: d.prepMinutes != null ? String(d.prepMinutes) : '',
    calories: d.calories != null ? String(d.calories) : '',
  };
}

export default function DishForm() {
  const { pid, did } = useLocalSearchParams();
  const { user } = useAuth();
  const { data: potluck, loading } = usePotluck(pid);
  const isMember = Boolean(potluck?.memberIds.includes(user.uid));
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
  const existing = did ? dishes.find((d) => d.id === did && d.authorId === user.uid) : null;
  if (did && !existing) return <Screen><PageHeader title="Edit dish" /><EmptyState title="Dish not found" /></Screen>;
  return <DishEditor key={existing?.id ?? 'new'} potluck={potluck} dishes={dishes} existing={existing} />;
}

function DishEditor({ potluck, dishes, existing }) {
  const pid = potluck.id;
  const { user, profile } = useAuth();
  const toast = useToast();
  const [confirmEl, confirm] = useConfirm();
  const [form, setForm] = useState(() => (existing ? fromDish(existing) : { ...blank }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [extraAllergen, setExtraAllergen] = useState('');

  const fmt = formatInfo(potluck.format);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const field = (key) => ({ value: form[key], onChangeText: (v) => set(key, v) });
  const counts = Object.fromEntries(potluck.dishCategories.map((c) => [c.id, dishes.filter((d) => d.categoryId === c.id && d.id !== existing?.id).length]));
  const needsRequired = potluck.format === 'mystery' && potluck.formatDetail;

  const missing = [
    !form.name.trim() && 'dish name',
    !form.categoryId && 'category',
    !form.ingredients.trim() && 'ingredients',
    needsRequired && !form.usedRequired && 'required-ingredient check',
  ].filter(Boolean);

  const submit = async () => {
    if (missing.length) return setError(`Please add: ${missing.join(', ')}.`);
    setBusy(true);
    setError('');
    try {
      await saveDish(pid, form, existing);
      toast(existing ? 'Dish updated' : 'Dish added! 🎉');
      router.back();
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
    return undefined;
  };

  const remove = async () => {
    if (!(await confirm({ title: 'Remove your dish?', body: 'This frees up your spot so you can pick a different dish.', confirmLabel: 'Remove', danger: true }))) return;
    try {
      await deleteDish(pid, existing);
      toast('Dish removed');
      router.back();
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const addAllergen = () => {
    const a = extraAllergen.trim();
    if (a && !form.allergens.includes(a)) set('allergens', [...form.allergens, a]);
    setExtraAllergen('');
  };

  return (
    <Screen footer={<Button size="lg" title={busy ? 'Saving…' : existing ? 'Save Dish' : 'Add Dish'} loading={busy} onPress={submit} />}>
      {confirmEl}
      <PageHeader title={existing ? 'Edit your dish' : 'Add your dish'} actions={<Avatar uid={user.uid} profile={profile} size={40} />} />

      <Tile tone="peach" style={{ padding: 14, marginBottom: 16 }}>
        <Row gap={10} style={{ marginBottom: 10 }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.coral, alignItems: 'center', justifyContent: 'center' }}>
            <Text>{fmt.emoji}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.body, type.bold]} numberOfLines={1}>{potluck.title}</Text>
            <Text style={[type.small, type.muted]}>{fmt.blurb} Voters judge:</Text>
          </View>
        </Row>
        <Row wrap gap={8}>
          {potluck.scoring.map((c) => (
            <View key={c.id} style={{ flexGrow: 1, flexBasis: '45%', backgroundColor: colors.white, borderRadius: 12, padding: 10 }}>
              <Text style={[type.small, type.muted]}>{c.name} · {c.weight}%</Text>
              <Text style={[type.small, { fontWeight: '600' }]}>{c.description}</Text>
            </View>
          ))}
        </Row>
        {potluck.formatDetail ? <Text style={[type.small, { marginTop: 8 }]}><Text style={type.bold}>{fmt.detailLabel}:</Text> {potluck.formatDetail}</Text> : null}
      </Tile>

      {error ? <Banner style={{ marginBottom: 12 }}>{error}</Banner> : null}
      <Stack gap={16}>
        <Field label="Dish name" {...field('name')} maxLength={80} placeholder="Spicy sesame noodles" />
        <Row gap={12} align="flex-start">
          <SelectField
            style={{ flex: 7 }}
            label={potluck.format === 'courses' ? 'Bracket' : 'Category'}
            value={form.categoryId}
            onChange={(v) => set('categoryId', v)}
            options={potluck.dishCategories.map((c) => {
              const left = c.needed - counts[c.id];
              return { value: c.id, label: c.name, sub: left > 0 ? `${left} needed` : 'Full' };
            })}
          />
          <Field style={{ flex: 5 }} label="Serves" {...field('serves')} maxLength={40} placeholder="8–10 people" />
        </Row>

        <PhotoPicker title="Add a photo of your dish" current={form.photo} pending={form.photoData}
          onPick={(d) => set('photoData', d)} onRemove={() => setForm((f) => ({ ...f, photo: null, photoData: null }))} />

        <Field label="Ingredients" {...field('ingredients')} rows={4}
          placeholder={'One per line, or separated by commas\n8 oz wheat noodles\n2 tbsp sesame paste'} />
        {needsRequired && (
          <Tile tone="gold" style={{ padding: 14 }}>
            <Checkbox checked={form.usedRequired} onChange={(v) => set('usedRequired', v)}>
              <Text style={type.body}>My dish uses every required ingredient: <Text style={type.bold}>{potluck.formatDetail}</Text></Text>
            </Checkbox>
          </Tile>
        )}

        <View>
          <Label style={{ marginBottom: 0 }}>Recipe</Label>
          <Text style={[type.small, type.muted, { marginBottom: 6 }]}>Type or paste the steps. Guests can find this in their recipe bank later.</Text>
          <Input {...field('steps')} rows={5} maxLength={8000} placeholder="1. Boil the noodles…" accessibilityLabel="Recipe" />
        </View>
        <PhotoPicker compact title="Or upload a photo of a recipe card" current={form.recipePhoto} pending={form.recipePhotoData}
          onPick={(d) => set('recipePhotoData', d)} onRemove={() => setForm((f) => ({ ...f, recipePhoto: null, recipePhotoData: null }))} />

        <Row gap={12} align="flex-start">
          <Field style={{ flex: 1 }} label="Prep time (min)" keyboardType="number-pad" placeholder="30"
            value={form.prepMinutes} onChangeText={(v) => set('prepMinutes', v.replace(/\D/g, ''))} />
          <Field style={{ flex: 1 }} label="Calories / serving" keyboardType="number-pad" placeholder="Optional"
            value={form.calories} onChangeText={(v) => set('calories', v.replace(/\D/g, ''))} />
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
          <ChipToggleGroup options={DIETARY_LABELS} value={form.dietary} onChange={(v) => set('dietary', v)} />
        </View>

        <Card style={{ padding: 14 }}>
          <Text style={[type.body, type.bold, { marginBottom: 6 }]}>Challenge tips</Text>
          {[
            'Choose whole ingredients, fresh flavors, and easy-to-share portions.',
            'Highlight healthy swaps, seasonal picks, and allergen-friendly choices.',
            'A clear photo helps people imagine the dish before tasting.',
          ].map((t) => <Text key={t} style={[type.small, type.muted, { marginBottom: 4 }]}>• {t}</Text>)}
        </Card>

        {missing.length === 0
          ? <Tile tone="mint" style={{ paddingVertical: 10, paddingHorizontal: 14 }}><Text style={[type.small, { color: colors.mintDark }]}>✓ All required details are complete.</Text></Tile>
          : <Hint>Still needed: {missing.join(', ')}.</Hint>}

        {existing && <Button variant="linkDanger" title="Remove my dish" onPress={remove} />}
      </Stack>
    </Screen>
  );
}
