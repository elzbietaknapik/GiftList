import { useState, type ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { TextField } from '@/components/ui/text-field';
import { GiftList } from '@/components/gift-list';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ListEmptyState } from '@/components/list-empty-state';
import { Spacing } from '@/constants/theme';
import type { Gift } from '@/lib/gifts';

const SAMPLE_GIFTS: Gift[] = [
  {
    id: 'sample-free',
    list_id: 'dev',
    name: 'Słuchawki bezprzewodowe z bardzo długą nazwą, która powinna się obciąć do dwóch linii',
    link: 'https://example.com',
    price: 349.99,
    image_url: null,
    status: 'free',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'sample-reserved',
    list_id: 'dev',
    name: 'Kubek termiczny',
    link: 'https://example.com',
    price: 79,
    image_url: 'https://example.invalid/missing.jpg',
    status: 'reserved',
    created_at: '2026-01-01T00:00:00Z',
  },
];

export default function UiStates() {
  if (!__DEV__) return null;

  return <UiStatesContent />;
}

function UiStatesContent() {
  const [name, setName] = useState('');

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: Spacing.four, gap: Spacing.three }}>
        <ThemedText type="title">UI states</ThemedText>

        <Section label="default">
          <Button label="Zapisz" onPress={() => {}} />
          <TextField
            value={name}
            onChangeText={setName}
            placeholder="Nazwa listy"
          />
          <ListEmptyState />
        </Section>

        <Section label="disabled">
          <Button label="Zapisz" onPress={() => {}} disabled />
          <TextField
            value={name}
            onChangeText={setName}
            placeholder="Nazwa listy"
            editable={false}
          />
        </Section>

        <Section label="error">
          <TextField
            value={name}
            onChangeText={setName}
            placeholder="Nazwa listy"
            invalid
            errorId="ui-states-error"
          />
          <FormError nativeID="ui-states-error">Podaj nazwę listy.</FormError>
        </Section>

        <Section label="focus-visible">
          <TextField
            value={name}
            onChangeText={setName}
            placeholder="Nazwa listy"
            autoFocus
          />
        </Section>

        <Section label="hover">
          <Button label="Zapisz" onPress={() => {}} />
          <ThemedText themeColor="textSecondary">
            hover: web only, check with pointer; N/A on native
          </ThemedText>
        </Section>

        <Section label="loading">
          <Button label="Zapisz" onPress={() => {}} loading />
        </Section>

        <Section label="destructive">
          <Button label="Usuń" variant="destructive" onPress={() => {}} />
          <Button label="Usuń" variant="destructive" onPress={() => {}} disabled />
        </Section>

        <Section label="empty">
          <ListEmptyState />
        </Section>

        <Section label="gift card (missing and broken image)">
          <GiftList gifts={SAMPLE_GIFTS} />
        </Section>
      </ScrollView>
    </ThemedView>
  );
}

type SectionProps = {
  label: string;
  children: ReactNode;
};

function Section({ label, children }: SectionProps) {
  return (
    <ThemedView style={{ gap: Spacing.three }}>
      <ThemedText type="subtitle">{label}</ThemedText>
      {children}
    </ThemedView>
  );
}
