import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Image,
  Alert,
  Modal,
  TextInput,
  Linking,
  Share,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../App';
import { COLORS } from '../theme/colors';
import { SPACING, FONT_SIZE, RADIUS, FONT_WEIGHT, SHADOW } from '../theme/spacing';
import { useTheme } from '../theme/ThemeContext';
import {
  getPlan, getParticipants, getMyParticipation, getApplications,
  joinPlan, leavePlan, applyToPlan, cancelApplication,
  approveApplication, rejectApplication, deletePlan, setPlanClosed,
  formatPlanDateTime, VISIBILITY_OPTIONS,
} from '../services/plans';
import type { TouringPlan, Participant, PlanApplication, ParticipationState } from '../services/plans';
import { formatTouringYears } from '../services/riderProfile';
import { isSignedIn, getCurrentUid } from '../services/firebase';
import {
  startSharing, stopSharing, getActiveSession, getSharedStatuses,
  type SharedStatus, type SharingMode,
} from '../services/planSharing';
import { needsBackgroundHint, BACKGROUND_HINT, BACKGROUND_HINT_INLINE } from '../services/deviceHints';
import MiniMapPreview from '../components/MiniMapPreview';

type RouteProps = RouteProp<RootStackParamList, 'PlanDetail'>;
type NavProp = StackNavigationProp<RootStackParamList>;

/** 参加者・申請者のバイク情報を1行にまとめる */
function credentialLine(c: Participant['credentials']): string {
  if (!c) return '情報未登録';
  return [
    c.bikeName,
    c.bikeType,
    c.touringYears != null ? `歴 ${formatTouringYears(c.touringYears)}` : null,
  ].filter(Boolean).join(' ・ ') || '情報未登録';
}

export default function PlanDetailScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const { planId } = route.params;

  const [plan, setPlan] = useState<TouringPlan | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [applications, setApplications] = useState<PlanApplication[]>([]);
  const [state, setState] = useState<ParticipationState>('none');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [applyModal, setApplyModal] = useState(false);
  const [applyMessage, setApplyMessage] = useState('');
  // 到着予定の共有
  const [sharingPlanId, setSharingPlanId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<SharedStatus[]>([]);

  const load = useCallback(async () => {
    const [p, parts, st] = await Promise.all([
      getPlan(planId).catch(() => null),
      getParticipants(planId).catch(() => []),
      getMyParticipation(planId).catch(() => 'none' as ParticipationState),
    ]);
    setPlan(p);
    setParticipants(parts);
    setState(st);
    if (st === 'owner') {
      setApplications(await getApplications(planId).catch(() => []));
    }
    // 共有状況は参加者でないと読めない（ルールで拒否される）ので、
    // 失敗しても画面全体は壊さない
    if (st !== 'none') {
      setStatuses(await getSharedStatuses(planId).catch(() => []));
    }
    const session = await getActiveSession().catch(() => null);
    setSharingPlanId(session?.planId ?? null);
    setLoading(false);
  }, [planId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isOwner = state === 'owner';
  const isFull = !!plan && plan.capacity != null && plan.participantCount >= plan.capacity;

  const handleJoin = async () => {
    if (!plan) return;
    if (!isSignedIn()) {
      Alert.alert('ログインが必要です', 'ツーリングに参加するにはログインしてください。', [
        { text: 'あとで', style: 'cancel' },
        { text: 'ログイン', onPress: () => navigation.navigate('Login', { reason: 'plan' }) },
      ]);
      return;
    }
    if (plan.visibility === 'approval') {
      setApplyModal(true);
      return;
    }
    setBusy(true);
    try {
      await joinPlan(plan);
      await load();
      Alert.alert('参加しました！', '当日の集合場所と時間をお間違えなく 🏍️');
    } catch (e: any) {
      Alert.alert('参加できませんでした', e?.message ?? '再度お試しください');
    } finally {
      setBusy(false);
    }
  };

  const submitApply = async () => {
    setBusy(true);
    try {
      await applyToPlan(planId, applyMessage);
      setApplyModal(false);
      setApplyMessage('');
      await load();
      Alert.alert('申請しました', '主催者が承認すると参加が確定します。');
    } catch (e: any) {
      Alert.alert('エラー', e?.message ?? '申請に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const beginSharing = async (mode: SharingMode) => {
    if (!plan?.meetingLat || !plan?.meetingLng) return;
    setBusy(true);
    try {
      await startSharing({
        planId,
        mode,
        destLat: plan.meetingLat,
        destLng: plan.meetingLng,
      });
      setSharingPlanId(planId);
      if (needsBackgroundHint()) {
        Alert.alert(BACKGROUND_HINT.title, BACKGROUND_HINT.body);
      }
    } catch (e: any) {
      Alert.alert('共有を開始できません', e?.message ?? '時間をおいてお試しください');
    } finally {
      setBusy(false);
    }
  };

  const handleStartSharing = () => {
    Alert.alert(
      '到着予定を共有しますか？',
      '集合場所に着くと自動で止まります。走行中の操作は不要です。',
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '到着予定だけ', onPress: () => beginSharing('eta') },
        { text: '現在地も共有', onPress: () => beginSharing('full') },
      ]
    );
  };

  const handleStopSharing = async () => {
    setBusy(true);
    try {
      await stopSharing();
      setSharingPlanId(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = () => {
    Alert.alert('参加を取り消す', `「${plan?.title}」への参加を取り消しますか？`, [
      { text: 'やめる', style: 'cancel' },
      {
        text: '取り消す',
        style: 'destructive',
        onPress: async () => {
          try { await leavePlan(planId); await load(); }
          catch (e: any) { Alert.alert('エラー', e?.message ?? '失敗しました'); }
        },
      },
    ]);
  };

  const handleDelete = () => {
    Alert.alert(
      '募集を削除',
      `「${plan?.title}」を削除しますか？\n\n⚠️ 参加者の情報もすべて削除されます。この操作は取り消せません。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: async () => {
            try { await deletePlan(planId); navigation.goBack(); }
            catch (e: any) { Alert.alert('エラー', e?.message ?? '削除に失敗しました'); }
          },
        },
      ]
    );
  };

  const handleShare = async () => {
    if (!plan) return;
    try {
      await Share.share({
        title: plan.title,
        message:
          `🏍️ ${plan.title}\n` +
          `📅 ${formatPlanDateTime(plan.dateTime)}\n` +
          `📍 集合: ${plan.meetingPlace}\n` +
          (plan.routeSummary ? `🗺️ ${plan.routeSummary}\n` : '') +
          `\nツーリングプランナーで募集中`,
      });
    } catch { /* キャンセル */ }
  };

  if (loading || !plan) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          {loading
            ? <ActivityIndicator size="large" color={colors.primary} />
            : <Text style={{ color: colors.textSecondary }}>計画が見つかりませんでした</Text>}
        </View>
      </SafeAreaView>
    );
  }

  const visOption = VISIBILITY_OPTIONS.find((o) => o.value === plan.visibility);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* 概要 */}
        <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{plan.title}</Text>
            {isOwner && (
              <TouchableOpacity
                style={[styles.editBtn, { borderColor: colors.border }]}
                onPress={() => navigation.navigate('PlanForm', { planId })}
              >
                <Text style={[styles.editBtnText, { color: colors.textSecondary }]}>✏️</Text>
              </TouchableOpacity>
            )}
          </View>

          {plan.closed && (
            <View style={styles.closedBanner}>
              <Text style={styles.closedBannerText}>この募集は締め切られました</Text>
            </View>
          )}

          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>📅</Text>
            <Text style={[styles.infoText, { color: colors.textPrimary }]}>
              {formatPlanDateTime(plan.dateTime)}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>📍</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoText, { color: colors.textPrimary }]}>{plan.meetingPlace}</Text>
              {plan.meetingMapUrl ? (
                <TouchableOpacity onPress={() => Linking.openURL(plan.meetingMapUrl!).catch(() => {})}>
                  <Text style={[styles.mapLink, { color: colors.primary }]}>地図で見る ›</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>👤</Text>
            <Text style={[styles.infoText, { color: isFull ? '#D97706' : colors.textPrimary }]}>
              {plan.participantCount}
              {plan.capacity != null ? ` / ${plan.capacity}人` : '人（定員なし）'}
              {isFull ? '（満員）' : ''}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>{visOption?.icon ?? '🌐'}</Text>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              {visOption?.label}
              {plan.visibility === 'group' && plan.groupName ? `（${plan.groupName}）` : ''}
            </Text>
          </View>

          {/* 集合場所の地図。参加者が当日どこへ行くのかを一目で確認できるように */}
          {plan.meetingLat != null && plan.meetingLng != null && (
            <View style={[styles.block, { borderTopColor: colors.borderLight }]}>
              <MiniMapPreview lat={plan.meetingLat} lng={plan.meetingLng} label={plan.meetingPlace} />
            </View>
          )}

          {plan.routeSummary ? (
            <View style={[styles.block, { borderTopColor: colors.borderLight }]}>
              <Text style={[styles.blockLabel, { color: colors.textMuted }]}>🗺️ ルート</Text>
              <Text style={[styles.blockText, { color: colors.textPrimary }]}>{plan.routeSummary}</Text>
            </View>
          ) : null}
          {plan.description ? (
            <View style={[styles.block, { borderTopColor: colors.borderLight }]}>
              <Text style={[styles.blockLabel, { color: colors.textMuted }]}>💬 主催者より</Text>
              <Text style={[styles.blockText, { color: colors.textPrimary }]}>{plan.description}</Text>
            </View>
          ) : null}

          {/* アクション */}
          {state === 'none' && !plan.closed && (
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { backgroundColor: isFull ? colors.textMuted : colors.primary },
                busy && { opacity: 0.6 },
              ]}
              onPress={handleJoin}
              disabled={busy || isFull}
            >
              <Text style={styles.primaryBtnText}>
                {isFull ? '満員です' : plan.visibility === 'approval' ? '参加を申請する' : '＋ 参加する'}
              </Text>
            </TouchableOpacity>
          )}
          {state === 'applied' && (
            <View style={styles.appliedWrap}>
              <Text style={[styles.appliedText, { color: colors.textSecondary }]}>⏳ 承認待ちです</Text>
              <TouchableOpacity onPress={async () => { await cancelApplication(planId); await load(); }}>
                <Text style={styles.cancelText}>申請を取り消す</Text>
              </TouchableOpacity>
            </View>
          )}
          {state === 'joined' && (
            <>
              <View style={[styles.joinedBanner, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.joinedText, { color: colors.primary }]}>✅ 参加予定です</Text>
              </View>
              <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
                <Text style={styles.leaveBtnText}>参加を取り消す</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={[styles.shareBtn, { borderColor: colors.border }]} onPress={handleShare}>
            <Text style={[styles.shareBtnText, { color: colors.textSecondary }]}>📤 この募集を共有</Text>
          </TouchableOpacity>
        </View>

        {/* 参加申請（主催者のみ） */}
        {isOwner && applications.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              🔔 参加申請（{applications.length}件）
            </Text>
            {applications.map((a) => (
              <View key={a.uid} style={[styles.appCard, { borderColor: colors.border }]}>
                <Text style={[styles.appName, { color: colors.textPrimary }]}>{a.displayName}</Text>
                <Text style={[styles.appCred, { color: colors.textSecondary }]}>
                  🏍️ {credentialLine(a.credentials)}
                </Text>
                {a.message ? (
                  <Text style={[styles.appMsg, { color: colors.textPrimary }]}>{a.message}</Text>
                ) : null}
                <View style={styles.appBtnRow}>
                  <TouchableOpacity
                    style={[styles.appBtn, { borderColor: colors.border }]}
                    onPress={async () => { await rejectApplication(planId, a.uid); await load(); }}
                  >
                    <Text style={[styles.appBtnText, { color: colors.textSecondary }]}>却下</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.appBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={async () => {
                      try { await approveApplication(plan, a); await load(); }
                      catch (e: any) { Alert.alert('承認できません', e?.message ?? ''); }
                    }}
                  >
                    <Text style={[styles.appBtnText, { color: '#fff' }]}>承認する</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* 到着予定の共有 */}
        {state !== 'none' && (
          <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              📍 到着予定の共有
            </Text>

            {!plan.meetingLat || !plan.meetingLng ? (
              <Text style={[styles.shareNote, { color: colors.textMuted }]}>
                この計画は集合場所の地点が未確定のため、到着予定を共有できません。
                {isOwner ? '計画を編集して集合場所を検索すると使えるようになります。' : '主催者に地点の設定を依頼してください。'}
              </Text>
            ) : sharingPlanId === planId ? (
              <>
                <Text style={[styles.shareOn, { color: colors.primary }]}>● 共有中</Text>
                <Text style={[styles.shareNote, { color: colors.textMuted }]}>
                  集合場所に着くと自動で停止します。
                </Text>
                {needsBackgroundHint() && (
                  <Text style={styles.hintInline}>{BACKGROUND_HINT_INLINE}</Text>
                )}
                <TouchableOpacity
                  style={[styles.locShareBtn, { backgroundColor: colors.textMuted, opacity: busy ? 0.5 : 1 }]}
                  onPress={handleStopSharing}
                  disabled={busy}
                >
                  <Text style={styles.locShareBtnText}>共有を停止</Text>
                </TouchableOpacity>
              </>
            ) : sharingPlanId ? (
              <Text style={[styles.shareNote, { color: colors.textMuted }]}>
                別のツーリングで共有中です。先にそちらを停止してください。
              </Text>
            ) : (
              <>
                <Text style={[styles.shareNote, { color: colors.textMuted }]}>
                  出発前にタップしてください。走行中の操作は不要です。
                </Text>
                {needsBackgroundHint() && (
                  <Text style={styles.hintInline}>{BACKGROUND_HINT_INLINE}</Text>
                )}
                <TouchableOpacity
                  style={[styles.locShareBtn, { backgroundColor: colors.primary, opacity: busy ? 0.5 : 1 }]}
                  onPress={handleStartSharing}
                  disabled={busy}
                >
                  <Text style={styles.locShareBtnText}>共有して出発</Text>
                </TouchableOpacity>
              </>
            )}

            {statuses.length > 0 && (
              <View style={styles.statusList}>
                {statuses.map((st) => {
                  const p = participants.find((x) => x.uid === st.uid);
                  const name = st.uid === getCurrentUid() ? 'あなた' : (p?.displayName ?? '参加者');
                  const ageMin = Math.floor((Date.now() - st.fixAt) / 60000);
                  // 古いデータを現在地として見せないため、経過時間は必ず出す
                  const stale = ageMin >= 5;
                  return (
                    <View key={st.uid} style={[styles.statusRow, { borderTopColor: colors.borderLight }]}>
                      <Text style={[styles.statusName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={[styles.statusEta, { color: st.arrived ? colors.primary : colors.textPrimary }]}>
                        {st.arrived
                          ? '到着済み'
                          : st.etaMinutes != null
                            ? `あと${st.etaMinutes}分`
                            : '—'}
                      </Text>
                      <Text style={[styles.statusSub, { color: stale ? '#d9534f' : colors.textMuted }]}>
                        {st.distanceKm != null && !st.arrived ? `残り${st.distanceKm}km / ` : ''}
                        {ageMin <= 0 ? 'たった今' : `${ageMin}分前`}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* 参加者一覧 */}
        <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            🏍️ 参加メンバー（{participants.length}人）
          </Text>
          {participants.map((p) => (
            <TouchableOpacity
              key={p.uid}
              style={[styles.memberRow, { borderBottomColor: colors.borderLight }]}
              onPress={() => navigation.navigate('UserProfile', { userId: p.uid, displayName: p.displayName })}
            >
              {p.photoUrl ? (
                <Image source={{ uri: p.photoUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarFallback, { backgroundColor: colors.primary }]}>
                  <Text style={styles.avatarText}>{p.displayName?.[0] ?? '?'}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View style={styles.memberNameRow}>
                  <Text style={[styles.memberName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {p.displayName}
                  </Text>
                  {p.uid === plan.ownerId && (
                    <View style={[styles.ownerBadge, { backgroundColor: colors.primaryLight }]}>
                      <Text style={[styles.ownerBadgeText, { color: colors.primary }]}>主催</Text>
                    </View>
                  )}
                </View>
                {/* 申請時に自動送信されたバイク情報 */}
                <Text style={[styles.memberCred, { color: colors.textMuted }]} numberOfLines={1}>
                  {credentialLine(p.credentials)}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* 主催者向け操作 */}
        {isOwner && (
          <>
            <TouchableOpacity
              style={[styles.closeToggle, { borderColor: colors.border }]}
              onPress={async () => { await setPlanClosed(planId, !plan.closed); await load(); }}
            >
              <Text style={[styles.closeToggleText, { color: colors.textSecondary }]}>
                {plan.closed ? '🔓 募集を再開する' : '🔒 募集を締め切る'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
              <Text style={styles.deleteBtnText}>🗑️ 募集を削除</Text>
            </TouchableOpacity>
          </>
        )}
        <View style={{ height: SPACING.xxxl }} />
      </ScrollView>

      {/* 参加申請モーダル */}
      <Modal visible={applyModal} transparent animationType="fade" onRequestClose={() => setApplyModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>参加を申請する</Text>
            <Text style={[styles.modalHint, { color: colors.textMuted }]}>
              あなたのバイク種別とツーリング歴が主催者に自動で伝わります
            </Text>
            <TextInput
              style={[styles.modalInput, { color: colors.textPrimary, borderColor: colors.border }]}
              value={applyMessage}
              onChangeText={setApplyMessage}
              placeholder="ひとこと（任意）"
              placeholderTextColor={colors.textMuted}
              multiline maxLength={200}
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: colors.border }]}
                onPress={() => setApplyModal(false)}
              >
                <Text style={[styles.modalBtnText, { color: colors.textSecondary }]}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={submitApply}
                disabled={busy}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>申請する</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shareNote:    { fontSize: 12, lineHeight: 18, marginBottom: 10 },
  hintInline:   { fontSize: 12, lineHeight: 18, marginBottom: 10, color: '#B45309' },
  shareOn:      { fontSize: 15, fontWeight: 'bold', marginBottom: 6 },
  locShareBtn:     { paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  locShareBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  statusList:   { marginTop: 14 },
  statusRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, gap: 8 },
  statusName:   { flex: 1, fontSize: 13, fontWeight: '600' },
  statusEta:    { fontSize: 13, fontWeight: 'bold' },
  statusSub:    { fontSize: 11 },
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: SPACING.lg },
  section: {
    borderRadius: RADIUS.lg, padding: SPACING.lg,
    marginBottom: SPACING.md, ...SHADOW.sm,
  },
  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, marginBottom: SPACING.md },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  title: { flex: 1, fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold },
  editBtn: { borderWidth: 1, borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: 6 },
  editBtnText: { fontSize: FONT_SIZE.sm },
  closedBanner: {
    backgroundColor: '#F4F4F4', borderRadius: RADIUS.sm,
    paddingVertical: SPACING.sm, alignItems: 'center', marginTop: SPACING.md,
  },
  closedBannerText: { fontSize: FONT_SIZE.sm, color: '#666', fontWeight: FONT_WEIGHT.bold },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: SPACING.md, gap: SPACING.sm },
  infoIcon: { fontSize: FONT_SIZE.md, width: 22 },
  infoText: { flex: 1, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semiBold },
  mapLink: { fontSize: FONT_SIZE.sm, marginTop: 2, fontWeight: FONT_WEIGHT.semiBold },
  block: { marginTop: SPACING.lg, paddingTop: SPACING.md, borderTopWidth: 1 },
  blockLabel: { fontSize: FONT_SIZE.xs, marginBottom: 4 },
  blockText: { fontSize: FONT_SIZE.md, lineHeight: 22 },
  primaryBtn: {
    marginTop: SPACING.lg, borderRadius: RADIUS.md,
    paddingVertical: SPACING.md, alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  appliedWrap: { marginTop: SPACING.lg, alignItems: 'center', gap: SPACING.xs },
  appliedText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  cancelText: { fontSize: FONT_SIZE.sm, color: '#DC2626', fontWeight: FONT_WEIGHT.semiBold },
  joinedBanner: {
    marginTop: SPACING.lg, borderRadius: RADIUS.md,
    paddingVertical: SPACING.md, alignItems: 'center',
  },
  joinedText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  leaveBtn: { alignItems: 'center', paddingVertical: SPACING.sm, marginTop: SPACING.xs },
  leaveBtnText: { color: '#DC2626', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semiBold },
  shareBtn: {
    marginTop: SPACING.md, borderWidth: 1, borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm, alignItems: 'center',
  },
  shareBtnText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semiBold },
  appCard: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  appName: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  appCred: { fontSize: FONT_SIZE.xs, marginTop: 2 },
  appMsg: { fontSize: FONT_SIZE.sm, marginTop: SPACING.sm, lineHeight: 19 },
  appBtnRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  appBtn: {
    flex: 1, borderWidth: 1, borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm, alignItems: 'center',
  },
  appBtnText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
  memberRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: SPACING.md, borderBottomWidth: 1, gap: SPACING.md,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  memberName: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semiBold },
  memberCred: { fontSize: FONT_SIZE.xs, marginTop: 1 },
  ownerBadge: { borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  ownerBadgeText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  closeToggle: {
    borderWidth: 1, borderRadius: RADIUS.md,
    paddingVertical: SPACING.md, alignItems: 'center', marginBottom: SPACING.sm,
  },
  closeToggleText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semiBold },
  deleteBtn: { alignItems: 'center', paddingVertical: SPACING.md },
  deleteBtnText: { color: '#DC2626', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semiBold },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: SPACING.xl,
  },
  modalCard: { width: '100%', borderRadius: RADIUS.xl, padding: SPACING.xl },
  modalTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  modalHint: { fontSize: FONT_SIZE.xs, marginTop: 4, marginBottom: SPACING.md },
  modalInput: {
    borderWidth: 1, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md, minHeight: 70, textAlignVertical: 'top',
  },
  modalBtnRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  modalBtn: {
    flex: 1, borderWidth: 1, borderRadius: RADIUS.md,
    paddingVertical: SPACING.md, alignItems: 'center',
  },
  modalBtnText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
});
