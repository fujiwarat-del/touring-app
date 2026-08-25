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
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../App';
import { COLORS } from '../theme/colors';
import { SPACING, FONT_SIZE, RADIUS, FONT_WEIGHT, SHADOW } from '../theme/spacing';
import { useTheme } from '../theme/ThemeContext';
import {
  getGroup, getGroupMembers, getMyMembership, joinGroup, leaveGroup,
  requestToJoin, cancelJoinRequest, getJoinRequests,
  approveJoinRequest, rejectJoinRequest, removeMember, deleteGroup,
} from '../services/groups';
import type { Group, GroupMember, JoinRequest, MembershipState } from '../services/groups';
import { formatTouringYears } from '../services/riderProfile';
import { isSignedIn } from '../services/firebase';

type RouteProps = RouteProp<RootStackParamList, 'GroupDetail'>;
type NavProp = StackNavigationProp<RootStackParamList>;

export default function GroupDetailScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const { groupId } = route.params;

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [membership, setMembership] = useState<MembershipState>('none');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [requestModal, setRequestModal] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');

  const load = useCallback(async () => {
    const [g, m, state] = await Promise.all([
      getGroup(groupId).catch(() => null),
      getGroupMembers(groupId).catch(() => []),
      getMyMembership(groupId).catch(() => 'none' as MembershipState),
    ]);
    setGroup(g);
    setMembers(m);
    setMembership(state);
    // 参加申請はオーナーのみ取得
    if (state === 'owner') {
      setRequests(await getJoinRequests(groupId).catch(() => []));
    }
    setLoading(false);
  }, [groupId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isOwner = membership === 'owner';

  const handleJoin = async () => {
    if (!group) return;
    if (!isSignedIn()) {
      Alert.alert('ログインが必要です', 'グループに参加するにはログインしてください。', [
        { text: 'あとで', style: 'cancel' },
        { text: 'ログイン', onPress: () => navigation.navigate('Login', { reason: 'group' }) },
      ]);
      return;
    }
    setBusy(true);
    try {
      if (group.requiresApproval) {
        setRequestModal(true);
      } else {
        await joinGroup(group);
        await load();
      }
    } catch (e: any) {
      Alert.alert('エラー', e?.message ?? '参加に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const submitRequest = async () => {
    setBusy(true);
    try {
      await requestToJoin(groupId, requestMessage);
      setRequestModal(false);
      setRequestMessage('');
      await load();
      Alert.alert('申請を送りました', '主催者が承認すると参加が確定します。');
    } catch (e: any) {
      Alert.alert('エラー', e?.message ?? '申請に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = () => {
    Alert.alert('グループを退会', `「${group?.name}」から退会しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '退会する',
        style: 'destructive',
        onPress: async () => {
          try { await leaveGroup(groupId); await load(); }
          catch (e: any) { Alert.alert('エラー', e?.message ?? '退会に失敗しました'); }
        },
      },
    ]);
  };

  const handleDeleteGroup = () => {
    Alert.alert(
      'グループを解散',
      `「${group?.name}」を解散しますか？\n\n⚠️ メンバー全員がグループから外れます。この操作は取り消せません。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '解散する',
          style: 'destructive',
          onPress: async () => {
            try { await deleteGroup(groupId); navigation.goBack(); }
            catch (e: any) { Alert.alert('エラー', e?.message ?? '解散に失敗しました'); }
          },
        },
      ]
    );
  };

  if (loading || !group) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          {loading
            ? <ActivityIndicator size="large" color={colors.primary} />
            : <Text style={{ color: colors.textSecondary }}>グループが見つかりませんでした</Text>}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* グループ情報 */}
        <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
          <View style={styles.titleRow}>
            <Text style={[styles.name, { color: colors.textPrimary }]}>{group.name}</Text>
            {isOwner && (
              <TouchableOpacity
                style={[styles.editBtn, { borderColor: colors.border }]}
                onPress={() => navigation.navigate('GroupForm', { groupId })}
              >
                <Text style={[styles.editBtnText, { color: colors.textSecondary }]}>✏️ 編集</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            👤 {group.memberCount}人{group.area ? ` ・ 📍 ${group.area}` : ''}
            {group.requiresApproval ? ' ・ 🔑 承認制' : ''}
          </Text>
          {group.description ? (
            <Text style={[styles.desc, { color: colors.textPrimary }]}>{group.description}</Text>
          ) : null}

          {/* 参加・退会ボタン */}
          {membership === 'none' && (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }, busy && { opacity: 0.6 }]}
              onPress={handleJoin}
              disabled={busy}
            >
              <Text style={styles.primaryBtnText}>
                {group.requiresApproval ? '参加を申請する' : '＋ 参加する'}
              </Text>
            </TouchableOpacity>
          )}
          {membership === 'requested' && (
            <View style={styles.requestedWrap}>
              <Text style={[styles.requestedText, { color: colors.textSecondary }]}>
                ⏳ 承認待ちです
              </Text>
              <TouchableOpacity
                onPress={async () => { await cancelJoinRequest(groupId); await load(); }}
              >
                <Text style={[styles.cancelReqText, { color: '#DC2626' }]}>申請を取り消す</Text>
              </TouchableOpacity>
            </View>
          )}
          {membership === 'member' && (
            <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
              <Text style={styles.leaveBtnText}>グループを退会</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 参加申請（オーナーのみ） */}
        {isOwner && requests.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              🔔 参加申請（{requests.length}件）
            </Text>
            {requests.map((r) => (
              <View key={r.uid} style={[styles.requestCard, { borderColor: colors.border }]}>
                <Text style={[styles.requestName, { color: colors.textPrimary }]}>{r.displayName}</Text>
                {/* 申請時に自動送信されたライダー情報 */}
                {r.credentials && (
                  <Text style={[styles.requestCred, { color: colors.textSecondary }]}>
                    {[
                      r.credentials.bikeName,
                      r.credentials.bikeType,
                      r.credentials.touringYears != null
                        ? `ツーリング歴 ${formatTouringYears(r.credentials.touringYears)}`
                        : null,
                    ].filter(Boolean).join(' ・ ') || '情報未登録'}
                  </Text>
                )}
                {r.message ? (
                  <Text style={[styles.requestMsg, { color: colors.textPrimary }]}>{r.message}</Text>
                ) : null}
                <View style={styles.requestBtnRow}>
                  <TouchableOpacity
                    style={[styles.reqBtn, { borderColor: colors.border }]}
                    onPress={async () => { await rejectJoinRequest(groupId, r.uid); await load(); }}
                  >
                    <Text style={[styles.reqBtnText, { color: colors.textSecondary }]}>却下</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.reqBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={async () => { await approveJoinRequest(group, r); await load(); }}
                  >
                    <Text style={[styles.reqBtnText, { color: '#fff' }]}>承認する</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* メンバー */}
        <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            👥 メンバー（{members.length}人）
          </Text>
          {members.map((m) => (
            <View key={m.uid} style={[styles.memberRow, { borderBottomColor: colors.borderLight }]}>
              <TouchableOpacity
                style={styles.memberMain}
                onPress={() => navigation.navigate('UserProfile', { userId: m.uid, displayName: m.displayName })}
              >
                {m.photoUrl ? (
                  <Image source={{ uri: m.photoUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatarFallback, { backgroundColor: colors.primary }]}>
                    <Text style={styles.avatarText}>{m.displayName?.[0] ?? '?'}</Text>
                  </View>
                )}
                <Text style={[styles.memberName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {m.displayName}
                </Text>
                {m.role === 'owner' && (
                  <View style={[styles.ownerBadge, { backgroundColor: colors.primaryLight }]}>
                    <Text style={[styles.ownerBadgeText, { color: colors.primary }]}>主催者</Text>
                  </View>
                )}
              </TouchableOpacity>
              {isOwner && m.role !== 'owner' && (
                <TouchableOpacity
                  onPress={() =>
                    Alert.alert('メンバーを外す', `${m.displayName} をグループから外しますか？`, [
                      { text: 'キャンセル', style: 'cancel' },
                      {
                        text: '外す',
                        style: 'destructive',
                        onPress: async () => { await removeMember(groupId, m.uid); await load(); },
                      },
                    ])
                  }
                >
                  <Text style={styles.removeText}>外す</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        {isOwner && (
          <TouchableOpacity style={styles.deleteGroupBtn} onPress={handleDeleteGroup}>
            <Text style={styles.deleteGroupText}>🗑️ グループを解散</Text>
          </TouchableOpacity>
        )}
        <View style={{ height: SPACING.xxxl }} />
      </ScrollView>

      {/* 参加申請モーダル */}
      <Modal visible={requestModal} transparent animationType="fade" onRequestClose={() => setRequestModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>参加を申請する</Text>
            <Text style={[styles.modalHint, { color: colors.textMuted }]}>
              あなたのバイク種別とツーリング歴が主催者に自動で伝わります
            </Text>
            <TextInput
              style={[styles.modalInput, { color: colors.textPrimary, borderColor: colors.border }]}
              value={requestMessage}
              onChangeText={setRequestMessage}
              placeholder="ひとこと（任意）"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={200}
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: colors.border }]}
                onPress={() => setRequestModal(false)}
              >
                <Text style={[styles.modalBtnText, { color: colors.textSecondary }]}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={submitRequest}
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
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: SPACING.lg },
  section: {
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOW.sm,
  },
  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, marginBottom: SPACING.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  name: { flex: 1, fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold },
  editBtn: {
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
  },
  editBtnText: { fontSize: FONT_SIZE.sm },
  meta: { fontSize: FONT_SIZE.sm, marginTop: SPACING.xs },
  desc: { fontSize: FONT_SIZE.md, lineHeight: 22, marginTop: SPACING.md },
  primaryBtn: {
    marginTop: SPACING.lg,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  requestedWrap: { marginTop: SPACING.lg, alignItems: 'center', gap: SPACING.xs },
  requestedText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  cancelReqText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semiBold },
  leaveBtn: { marginTop: SPACING.lg, alignItems: 'center', paddingVertical: SPACING.sm },
  leaveBtnText: { color: '#DC2626', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semiBold },
  requestCard: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  requestName: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  requestCred: { fontSize: FONT_SIZE.xs, marginTop: 2 },
  requestMsg: { fontSize: FONT_SIZE.sm, marginTop: SPACING.sm, lineHeight: 19 },
  requestBtnRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  reqBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  reqBtnText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  memberMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  memberName: { flex: 1, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semiBold },
  ownerBadge: { borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  ownerBadgeText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  removeText: { color: '#DC2626', fontSize: FONT_SIZE.sm, paddingLeft: SPACING.md },
  deleteGroupBtn: { alignItems: 'center', paddingVertical: SPACING.lg },
  deleteGroupText: { color: '#DC2626', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semiBold },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  modalCard: { width: '100%', borderRadius: RADIUS.xl, padding: SPACING.xl },
  modalTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  modalHint: { fontSize: FONT_SIZE.xs, marginTop: 4, marginBottom: SPACING.md },
  modalInput: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  modalBtnRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  modalBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  modalBtnText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
});
