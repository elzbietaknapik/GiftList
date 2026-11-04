import { useState, type ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { TextField } from '@/components/ui/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ListEmptyState } from '@/components/list-empty-state';
import { Spacing } from '@/constants/theme';

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
