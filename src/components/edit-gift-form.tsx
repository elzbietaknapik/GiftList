import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { parseGiftInput, updateGift, type Gift, type GiftFieldErrors } from '@/lib/gifts';

type EditGiftFormProps = {
  gift: Gift;
  onSaved: (gift: Gift) => void;
  onCancel: () => void;
};

export function EditGiftForm({ gift, onSaved, onCancel }: EditGiftFormProps) {
  const [name, setName] = useState(gift.name);
  const [link, setLink] = useState(gift.link);
  const [price, setPrice] = useState(gift.price.toFixed(2));
  const [image, setImage] = useState(gift.image_url ?? '');
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
      const updated = await updateGift(gift.id, result.value);
      onSaved(updated);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Nie udało się zapisać zmian.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.form}>
      <ThemedText type="subtitle">Edytuj prezent</ThemedText>

      <TextField
        value={name}
        onChangeText={setName}
        placeholder="Nazwa prezentu"
        invalid={!!errors.name}
        errorId="edit-gift-name-error"
        autoCapitalize="sentences"
      />
      {errors.name ? <FormError nativeID="edit-gift-name-error">{errors.name}</FormError> : null}

      <TextField
        value={link}
        onChangeText={setLink}
        placeholder="Link do prezentu"
        invalid={!!errors.link}
        errorId="edit-gift-link-error"
        keyboardType="url"
        autoCapitalize="none"
      />
      {errors.link ? <FormError nativeID="edit-gift-link-error">{errors.link}</FormError> : null}

      <TextField
        value={price}
        onChangeText={setPrice}
        placeholder="Cena (zł)"
        invalid={!!errors.price}
        errorId="edit-gift-price-error"
        keyboardType="decimal-pad"
      />
      {errors.price ? <FormError nativeID="edit-gift-price-error">{errors.price}</FormError> : null}

      <TextField
        value={image}
        onChangeText={setImage}
        placeholder="Link do zdjęcia (opcjonalnie)"
        invalid={!!errors.image}
        errorId="edit-gift-image-error"
        keyboardType="url"
        autoCapitalize="none"
      />
      {errors.image ? <FormError nativeID="edit-gift-image-error">{errors.image}</FormError> : null}

      {formError ? <FormError>{formError}</FormError> : null}

      <View style={styles.actions}>
        <Button
          label="Zapisz zmiany"
          accessibilityLabel={`Zapisz zmiany: ${gift.name}`}
          onPress={handleSubmit}
          loading={saving}
          style={styles.action}
        />
        <Button label="Anuluj" onPress={onCancel} disabled={saving} style={styles.action} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.three,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  action: {
    flex: 1,
  },
});
