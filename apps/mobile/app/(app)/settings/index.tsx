import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { Disclosure, OutboundMark } from '../../../src/components/Disclosure';
import { PlatformGlyphs } from '../../../src/components/PlatformGlyphs';
import { useAuth } from '../../../src/lib/AuthContext';
import { API_URL } from '../../../src/lib/config';
import { trpc } from '../../../src/lib/trpc';
import {
  buildSettingsModel,
  type SettingsConnectionRow,
  type SettingsUsage,
} from '../../../src/models/settings';

/**
 * Settings = an inset-grouped list: Account, Connected accounts, Plan & usage,
 * About, then Sign out and Delete account. It reads and links out; changing a
 * connection or the plan happens on the web, in the in-app browser. Connected
 * accounts sits second so the hand-offs from Home and the Queue item sheet
 * land with it in view. All derivation lives in the Settings model; this
 * screen only maps it to views.
 */

const APP_VERSION = {
  version: Constants.expoConfig?.version ?? null,
  build: Constants.expoConfig?.ios?.buildNumber ?? null,
};

const CONNECTION_TONE: Record<SettingsConnectionRow['tone'], string> = {
  // A healthy connection stays ink (Status-Only Saturation).
  ok: 'text-ink-secondary',
  warn: 'text-signal-warn',
  critical: 'text-signal-critical',
  muted: 'text-ink-tertiary',
};

const METER_FILL: Record<SettingsUsage['tone'], string> = {
  normal: 'bg-ink-tertiary',
  warn: 'bg-signal-warn',
  critical: 'bg-signal-critical',
};

export default function SettingsScreen() {
  const router = useRouter();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const { signOut } = useAuth();
  const me = trpc.user.me.useQuery();
  const connections = trpc.connections.overview.useQuery();
  const billing = trpc.billing.status.useQuery();
  const [refreshing, setRefreshing] = useState(false);

  // A hand-off from Home or the Queue item sheet (`CONNECTIONS_HREF`): the tab
  // keeps its scroll, so bring Connected accounts back into view, then clear
  // the param so the next hand-off sets it afresh. Offset 0 tucks Account under
  // the collapsed title and leaves Connected accounts in full view.
  useEffect(() => {
    if (focus !== 'connections') return;
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    router.setParams({ focus: undefined });
  }, [focus, router]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([me.refetch(), connections.refetch(), billing.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }

  if (me.isLoading && connections.isLoading && billing.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-ground">
        <ActivityIndicator size="large" color="#2d3f63" />
      </View>
    );
  }

  const model = buildSettingsModel({
    me: me.data,
    connections: connections.data,
    billing: billing.data,
    app: APP_VERSION,
    apiUrl: API_URL,
  });

  function confirmSignOut() {
    Alert.alert('Sign out of PostPilot?', 'Your queue keeps posting while you’re signed out.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  return (
    <ScrollView
      ref={scrollRef}
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-ground"
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Section title="Account">
        {model.account ? (
          <>
            <ValueRow first label="Name" value={model.account.name} />
            <ValueRow label="Email" value={model.account.email} />
          </>
        ) : (
          <Unavailable loading={me.isLoading} what="your account" />
        )}
      </Section>

      <Section title="Connected accounts">
        {model.connections ? (
          model.connections.map((row, i) => (
            <ConnectionRow key={row.key} row={row} first={i === 0} />
          ))
        ) : (
          <Unavailable loading={connections.isLoading} what="your connections" />
        )}
        <LinkRow
          first={model.connections?.length === 0}
          label="Manage on the web"
          url={model.manageConnectionsUrl}
        />
      </Section>

      <Section title="Plan & usage" footer={model.plan?.note}>
        {model.plan ? (
          <>
            <View className="min-h-[44px] justify-center gap-0.5 px-4 py-3">
              <Text className="text-[17px] font-semibold leading-[22px] text-ink">
                {model.plan.name}
              </Text>
              {model.plan.period ? (
                <Text className="text-[13px] leading-[18px] text-ink-tertiary">
                  {model.plan.period}
                </Text>
              ) : null}
            </View>
            {model.plan.usage.map((usage) => (
              <UsageRow key={usage.key} usage={usage} />
            ))}
          </>
        ) : (
          <Unavailable loading={billing.isLoading} what="your plan" />
        )}
      </Section>

      <Section title="About">
        <ValueRow first label="Version" value={model.about.version} />
        {model.about.links.map((link) => (
          <LinkRow key={link.key} label={link.label} url={link.url} />
        ))}
      </Section>

      <View className="mt-9">
        <Group>
          <ActionRow first label="Sign Out" onPress={confirmSignOut} />
          <ActionRow
            label="Delete Account"
            destructive
            hint="Opens a screen to confirm deleting your account"
            onPress={() => router.push('/settings/delete-account')}
          />
        </Group>
      </View>
    </ScrollView>
  );
}

async function openWeb(url: string) {
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    Alert.alert('Couldn’t open the web page', url);
  }
}

// --- Structure --------------------------------------------------------------

function Section({
  title,
  footer,
  children,
}: {
  title: string;
  footer?: string | null;
  children: React.ReactNode;
}) {
  return (
    <View className="mt-7">
      <Text
        accessibilityRole="header"
        className="mb-2 px-1 text-[13px] font-semibold text-ink-tertiary"
      >
        {title}
      </Text>
      <Group>{children}</Group>
      {footer ? (
        <Text className="mt-2 px-1 text-[13px] leading-[18px] text-ink-tertiary">{footer}</Text>
      ) : null}
    </View>
  );
}

/** An inset-grouped list: one hairline-bounded surface, rows split by inset rules. */
function Group({ children }: { children: React.ReactNode }) {
  return (
    <View className="overflow-hidden rounded-xl border border-hairline bg-surface">{children}</View>
  );
}

/** A row-to-row rule; inset ones start at the text, like a native list. */
function Rule({ inset = 'ml-4' }: { inset?: string }) {
  return <View className={`h-px bg-hairline ${inset}`} />;
}

// --- Rows -------------------------------------------------------------------

function ValueRow({
  label,
  value,
  first = false,
}: {
  label: string;
  value: string;
  first?: boolean;
}) {
  return (
    <>
      {first ? null : <Rule />}
      <View
        accessible
        accessibilityLabel={`${label}, ${value}`}
        className="min-h-[44px] flex-row items-center justify-between gap-4 px-4 py-2.5"
      >
        <Text className="text-[17px] text-ink">{label}</Text>
        <Text
          numberOfLines={1}
          selectable
          className="shrink text-right text-[17px] text-ink-tertiary"
        >
          {value}
        </Text>
      </View>
    </>
  );
}

function LinkRow({ label, url, first = false }: { label: string; url: string; first?: boolean }) {
  return (
    <>
      {first ? null : <Rule />}
      <Pressable
        onPress={() => openWeb(url)}
        accessibilityRole="link"
        accessibilityHint="Opens in the in-app browser"
        className="min-h-[44px] flex-row items-center justify-between px-4 active:opacity-60"
      >
        <Text className="text-[17px] text-primary">{label}</Text>
        <OutboundMark />
      </Pressable>
    </>
  );
}

function ConnectionRow({ row, first }: { row: SettingsConnectionRow; first: boolean }) {
  const body = (
    <>
      <View className="flex-1 flex-row items-center gap-2">
        <PlatformGlyphs platforms={[row.platform]} />
        <Text numberOfLines={1} className="shrink text-[17px] text-ink">
          {row.name}
        </Text>
      </View>
      <Text className={`text-[15px] ${CONNECTION_TONE[row.tone]}`}>{row.status}</Text>
      {row.webUrl ? <OutboundMark /> : null}
    </>
  );
  const className = 'min-h-[44px] flex-row items-center gap-3 px-4 py-2.5';
  return (
    <>
      {/* Starts at the platform name, past the 13pt glyph and its 8pt gap. */}
      {first ? null : <Rule inset="ml-[37px]" />}
      {row.webUrl ? (
        <Pressable
          onPress={() => openWeb(row.webUrl!)}
          accessibilityRole="link"
          accessibilityLabel={`${row.name}, ${row.status}`}
          accessibilityHint="Opens Connections on the web"
          className={`${className} active:opacity-60`}
        >
          {body}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={`${row.name}, ${row.status}`} className={className}>
          {body}
        </View>
      )}
    </>
  );
}

function UsageRow({ usage }: { usage: SettingsUsage }) {
  return (
    <>
      <Rule />
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`${usage.label}, ${usage.copy}`}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(usage.ratio * 100) }}
        className="gap-2 px-4 py-3"
      >
        <View className="flex-row items-baseline justify-between gap-4">
          <Text className="text-[17px] text-ink">{usage.label}</Text>
          <Text
            className={`text-[15px] ${
              usage.tone === 'normal' ? 'text-ink-tertiary' : CONNECTION_TONE[usage.tone]
            }`}
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {usage.copy}
          </Text>
        </View>
        <View className="h-1.5 overflow-hidden rounded-full bg-hairline">
          <View
            className={`h-full rounded-full ${METER_FILL[usage.tone]}`}
            style={{ width: `${usage.ratio * 100}%` }}
          />
        </View>
      </View>
    </>
  );
}

function ActionRow({
  label,
  onPress,
  hint,
  destructive = false,
  first = false,
}: {
  label: string;
  onPress: () => void;
  hint?: string;
  destructive?: boolean;
  first?: boolean;
}) {
  return (
    <>
      {first ? null : <Rule />}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityHint={hint}
        className="min-h-[44px] flex-row items-center justify-between px-4 active:opacity-60"
      >
        <Text className={`text-[17px] ${destructive ? 'text-signal-critical' : 'text-primary'}`}>
          {label}
        </Text>
        {destructive ? <Disclosure /> : null}
      </Pressable>
    </>
  );
}

function Unavailable({ loading, what }: { loading: boolean; what: string }) {
  return (
    <View className="min-h-[44px] justify-center px-4 py-3">
      {loading ? (
        <ActivityIndicator color="#2d3f63" />
      ) : (
        <Text className="text-[15px] leading-5 text-ink-tertiary">
          Couldn’t load {what}. Pull down to try again.
        </Text>
      )}
    </View>
  );
}
