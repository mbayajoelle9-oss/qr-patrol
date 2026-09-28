import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { Btn, styles } from '@/components/ui';
import { colors } from '@/lib/theme';

export default function Login() {
  const { login, logout } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError('');
    setBusy(true);
    try {
      await login(identifier.trim(), password);
    } catch (e) {
      setError((e as Error).message);
      await logout().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginBottom: 36 }}>
            <Image source={require('../assets/logo-fameco.png')} style={{ width: 280, height: 93 }} resizeMode="contain" />
            <Text style={{ color: colors.muted, letterSpacing: 3, fontSize: 12, fontWeight: '700', marginTop: 14 }}>QR PATROL · AGENT</Text>
          </View>

          <Text style={styles.label}>Matricule ou e-mail</Text>
          <TextInput
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="AG001"
            placeholderTextColor="#52525B"
            style={[styles.input, { marginBottom: 16 }]}
          />
          <Text style={styles.label}>Mot de passe / code</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••"
            placeholderTextColor="#52525B"
            style={[styles.input, { marginBottom: 20 }]}
            onSubmitEditing={submit}
          />
          {!!error && (
            <View style={{ backgroundColor: '#450A0A', borderColor: '#7F1D1D', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <Text style={{ color: '#FCA5A5' }}>{error}</Text>
            </View>
          )}
          <Btn title="Se connecter" onPress={submit} loading={busy} disabled={!identifier || !password} big />
          <Text style={[styles.muted, { textAlign: 'center', marginTop: 24, fontSize: 12 }]}>
            Votre compte est lié à ce téléphone. En cas de changement d’appareil, contactez votre superviseur.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
