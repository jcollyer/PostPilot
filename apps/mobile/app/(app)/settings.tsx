import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';

import { trpc } from '../../src/lib/trpc';
import { useAuth } from '../../src/lib/AuthContext';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { TextField } from '../../src/components/TextField';

/**
 * Settings screen — edit display name, view account info, sign out, and a
 * guarded delete-account flow (type your email to confirm).
 */
export default function SettingsScreen() {
  const utils = trpc.useUtils();
  const { signOut } = useAuth();

  const { data: me, isLoading } = trpc.user.me.useQuery();

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteEmailInput, setDeleteEmailInput] = useState('');

  useEffect(() => {
    if (me?.name != null) setName(me.name);
  }, [me?.name]);

  const updateProfile = trpc.user.updateProfile.useMutation({
    onSuccess: () => {
      utils.user.me.invalidate();
      setSavedAt(Date.now());
    },
    onError: (err) => Alert.alert('Could not save settings', err.message),
  });

  const deleteAccount = trpc.user.deleteAccount.useMutation({
    onSuccess: async () => {
      await signOut();
    },
    onError: (err) => Alert.alert('Could not delete account', err.message),
  });

  const trimmed = name.trim();
  const dirty = trimmed.length > 0 && trimmed !== (me?.name ?? '');

  function handleSave() {
    if (!trimmed) {
      setNameError('Name cannot be empty.');
      return;
    }
    if (trimmed.length > 80) {
      setNameError('Name must be 80 characters or fewer.');
      return;
    }
    setNameError(null);
    setSavedAt(null);
    updateProfile.mutate({ name: trimmed });
  }

  function handleDeleteAccount() {
    const typedEmail = deleteEmailInput.trim();
    const accountEmail = (me?.email ?? '').trim();
    if (typedEmail.toLowerCase() !== accountEmail.toLowerCase()) {
      Alert.alert('Email does not match', 'Please type your account email exactly to confirm.');
      return;
    }
    deleteAccount.mutate({ confirmEmail: typedEmail });
  }

  if (isLoading && !me) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2d3f63" />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Profile */}
      <Card className="mb-4 gap-5 p-4">
        <Text className="text-base font-semibold text-slate-900">Profile</Text>

        <TextField
          label="Name"
          value={name}
          onChangeText={(v) => {
            setName(v);
            setNameError(null);
            setSavedAt(null);
          }}
          placeholder="Your name"
          autoComplete="name"
          autoCorrect={false}
          maxLength={80}
          error={nameError ?? undefined}
        />

        <TextField
          label="Email"
          value={me?.email ?? ''}
          editable={false}
          hint="Your email is tied to your sign-in and can't be changed here."
          style={{ opacity: 0.6 }}
        />

        {savedAt && !dirty ? <Text className="text-xs text-slate-500">Settings saved.</Text> : null}

        <Button
          onPress={handleSave}
          disabled={!dirty || updateProfile.isPending}
          loading={updateProfile.isPending}
        >
          Save changes
        </Button>
      </Card>

      {/* Account */}
      <Card className="gap-3 p-4">
        <Text className="text-base font-semibold text-slate-900">Account</Text>

        <Button variant="outline" onPress={() => signOut()}>
          Sign out
        </Button>

        {!showDeleteConfirm ? (
          <Button variant="destructive" onPress={() => setShowDeleteConfirm(true)}>
            Delete account
          </Button>
        ) : (
          <View style={{ gap: 12 }}>
            <View
              style={{
                backgroundColor: '#fef2f2',
                borderRadius: 8,
                padding: 12,
                borderWidth: 1,
                borderColor: '#fecaca',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#dc2626', marginBottom: 4 }}>
                This cannot be undone
              </Text>
              <Text style={{ fontSize: 12, color: '#ef4444', lineHeight: 18 }}>
                All your account data will be permanently deleted. Type your account email below to
                confirm.
              </Text>
            </View>

            <TextField
              label={`Type "${me?.email ?? 'your email'}" to confirm`}
              value={deleteEmailInput}
              onChangeText={setDeleteEmailInput}
              placeholder={me?.email ?? 'your@email.com'}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!deleteAccount.isPending}
            />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                variant="outline"
                className="flex-1"
                onPress={() => {
                  setShowDeleteConfirm(false);
                  setDeleteEmailInput('');
                }}
                disabled={deleteAccount.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onPress={handleDeleteAccount}
                disabled={deleteAccount.isPending || !deleteEmailInput.trim()}
                loading={deleteAccount.isPending}
              >
                Delete permanently
              </Button>
            </View>
          </View>
        )}
      </Card>
    </ScrollView>
  );
}
