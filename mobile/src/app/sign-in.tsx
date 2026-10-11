import { useState } from 'react';
import { Body, Button, ErrorText, Field, Screen, Title } from '../components/ui';
import { supabase } from '../lib/supabase';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    const credentials = { email: email.trim(), password };
    const { data, error } = creating
      ? await supabase.auth.signUp(credentials)
      : await supabase.auth.signInWithPassword(credentials);
    setBusy(false);
    if (error) setError(error.message);
    else if (creating && !data.session) {
      setError('Account created, but Supabase is waiting on email confirmation. Turn off "Confirm email" in Supabase.');
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Title>Airsoft Tracker</Title>
      <Body muted>{creating ? 'Create an account with your email and a password.' : 'Sign in with your email and password.'}</Body>
      <Field
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <Field
        value={password}
        onChangeText={setPassword}
        placeholder="Password (6+ characters)"
        autoCapitalize="none"
        autoComplete={creating ? 'new-password' : 'current-password'}
        secureTextEntry
        onSubmitEditing={submit}
      />
      <ErrorText>{error}</ErrorText>
      <Button
        title={creating ? 'Create account' : 'Sign in'}
        onPress={submit}
        busy={busy}
        disabled={!email.includes('@') || password.length < 6}
      />
      <Button
        title={creating ? 'I already have an account' : 'Create an account'}
        variant="secondary"
        onPress={() => {
          setCreating(!creating);
          setError('');
        }}
      />
    </Screen>
  );
}
