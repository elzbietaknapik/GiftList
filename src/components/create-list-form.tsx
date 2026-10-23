import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { TextField } from '@/components/ui/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { createList, getMyList, ListAlreadyExistsError, type GiftList } from '@/lib/lists';

type CreateListFormProps = {
  userId: string;
  onCreated: (list: GiftList) => void;
};

export function CreateListForm({ userId, onCreated }: CreateListFormProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Podaj nazwę listy.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const created = await createList(userId, trimmed);
      onCreated(created);
      setName('');
    } catch (e) {
      if (e instanceof ListAlreadyExistsError) {
        const existing = await getMyList(userId);
        if (existing) onCreated(existing);
      } else {
        setError(e instanceof Error ? e.message : 'Nie udało się zapisać listy.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.form}>
      <ThemedText themeColor="textSecondary">Utwórz swoją pierwszą listę prezentową.</ThemedText>

      <TextField
        value={name}
        onChangeText={setName}
        placeholder="Nazwa listy"
        invalid={!!error}
        errorId="create-list-error"
        autoCapitalize="sentences"
      />

      {error ? <FormError nativeID="create-list-error">{error}</FormError> : null}

      <Button label="Zapisz" onPress={handleSubmit} loading={saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.three,
  },
});
