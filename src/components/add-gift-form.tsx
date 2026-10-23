import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { addGift, parseGiftInput, type Gift, type GiftFieldErrors } from '@/lib/gifts';

type AddGiftFormProps = {
  listId: string;
  onAdded: (gift: Gift) => void;
};

export function AddGiftForm({ listId, onAdded }: AddGiftFormProps) {
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [price, setPrice] = useState('');
  const [image, setImage] = useState('');
  const [errors, setErrors] = useState<GiftFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (saving) return;

    const result = parseGiftInput({ name, link, price, image });
    if (result.value === null) {
      setErrors(result.errors);
      setFormError(null);
      return;
    }

    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      const created = await addGift(listId, result.value);
      onAdded(created);
      setName('');
      setLink('');
      setPrice('');
      setImage('');
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Nie udało się zapisać prezentu.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.form}>
      <ThemedText type="subtitle">Dodaj prezent</ThemedText>

      <TextField
        value={name}
        onChangeText={setName}
        placeholder="Nazwa prezentu"
        invalid={!!errors.name}
        errorId="add-gift-name-error"
        autoCapitalize="sentences"
      />
      {errors.name ? <FormError nativeID="add-gift-name-error">{errors.name}</FormError> : null}

      <TextField
        value={link}
        onChangeText={setLink}
        placeholder="Link do prezentu"
        invalid={!!errors.link}
        errorId="add-gift-link-error"
        keyboardType="url"
        autoCapitalize="none"
      />
      {errors.link ? <FormError nativeID="add-gift-link-error">{errors.link}</FormError> : null}

      <TextField
        value={price}
        onChangeText={setPrice}
        placeholder="Cena (zł)"
        invalid={!!errors.price}
        errorId="add-gift-price-error"
        keyboardType="decimal-pad"
      />
      {errors.price ? <FormError nativeID="add-gift-price-error">{errors.price}</FormError> : null}

      <TextField
        value={image}
        onChangeText={setImage}
        placeholder="Link do zdjęcia (opcjonalnie)"
        invalid={!!errors.image}
        errorId="add-gift-image-error"
        keyboardType="url"
        autoCapitalize="none"
      />
      {errors.image ? <FormError nativeID="add-gift-image-error">{errors.image}</FormError> : null}

      {formError ? <FormError>{formError}</FormError> : null}

      <Button label="Dodaj prezent" onPress={handleSubmit} loading={saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.three,
  },
});
