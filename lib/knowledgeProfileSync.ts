import {
  deleteUserKnowledgeProfileRecord,
  getStoredAuthToken,
  getUserKnowledgeProfileRecord,
  listUserKnowledgeProfiles,
  saveUserKnowledgeProfileRecord,
  selectUserKnowledgeProfileRecord,
} from "@/lib/api";
import {
  deleteLocalKnowledgeProfileRecord,
  getAccountKnowledgeProfileRecords,
  getLocalKnowledgeProfileRecord,
  saveLocalKnowledgeProfileRecord,
  setSelectedLocalKnowledgeProfileRecord,
  type LocalKnowledgeProfileRecord,
} from "@/lib/knowledgeProfileStore";
import type { UserKnowledgeProfile, UserProfile } from "@/types/user";

type ProfileOwner = Pick<UserProfile, "id" | "username" | "displayName">;

function shouldUseOnlineProfiles(isGuest: boolean) {
  return !isGuest && Boolean(getStoredAuthToken());
}

export async function syncOnlineKnowledgeProfilesToLocal(
  user: ProfileOwner,
): Promise<LocalKnowledgeProfileRecord[]> {
  const summaries = await listUserKnowledgeProfiles();

  for (const summary of summaries) {
    const profileRecord = await getUserKnowledgeProfileRecord(summary.id);

    saveLocalKnowledgeProfileRecord({
      user,
      isGuest: false,
      knowledgeProfile: profileRecord.knowledgeProfile,
      profileId: profileRecord.id,
      profileName: profileRecord.name,
      makeActive: summary.isSelected,
      replaceDuplicateName: true,
    });
  }

  return getAccountKnowledgeProfileRecords({
    userId: user.id,
    isGuest: false,
  });
}

export async function loadKnowledgeProfileRecordsForAccount({
  user,
  isGuest,
}: {
  user: ProfileOwner;
  isGuest: boolean;
}) {
  if (shouldUseOnlineProfiles(isGuest)) {
    return syncOnlineKnowledgeProfilesToLocal(user);
  }

  return getAccountKnowledgeProfileRecords({
    userId: user.id,
    isGuest,
  });
}

export async function saveKnowledgeProfileForAccount({
  user,
  isGuest,
  knowledgeProfile,
  profileId,
  profileName,
}: {
  user: ProfileOwner;
  isGuest: boolean;
  knowledgeProfile: UserKnowledgeProfile;
  profileId?: string | null;
  profileName: string;
}) {
  if (shouldUseOnlineProfiles(isGuest)) {
    const onlineRecord = await saveUserKnowledgeProfileRecord({
      profileId,
      profileName,
      knowledgeProfile,
      makeActive: true,
    });

    return saveLocalKnowledgeProfileRecord({
      user,
      isGuest: false,
      knowledgeProfile: onlineRecord.knowledgeProfile,
      profileId: onlineRecord.id,
      profileName: onlineRecord.name,
      replaceDuplicateName: true,
    });
  }

  return saveLocalKnowledgeProfileRecord({
    user,
    isGuest,
    knowledgeProfile,
    profileId,
    profileName,
  });
}

export async function selectKnowledgeProfileForAccount({
  user,
  isGuest,
  profileId,
}: {
  user: ProfileOwner;
  isGuest: boolean;
  profileId: string;
}) {
  if (shouldUseOnlineProfiles(isGuest)) {
    await selectUserKnowledgeProfileRecord(profileId);
  }

  setSelectedLocalKnowledgeProfileRecord({
    userId: user.id,
    isGuest,
    profileId,
  });
}

export async function deleteKnowledgeProfileForAccount({
  user,
  isGuest,
  profileId,
}: {
  user: ProfileOwner;
  isGuest: boolean;
  profileId: string;
}) {
  if (shouldUseOnlineProfiles(isGuest)) {
    await deleteUserKnowledgeProfileRecord(profileId);
    const records = await syncOnlineKnowledgeProfilesToLocal(user);
    const selectedRecord =
      getLocalKnowledgeProfileRecord({
        userId: user.id,
        isGuest: false,
      }) ?? records[0];

    return {
      records,
      selectedRecord,
      createdDefault: false,
    };
  }

  return deleteLocalKnowledgeProfileRecord({
    user,
    isGuest,
    profileId,
  });
}
