import { createId } from "@/lib/id";
import type { UserKnowledgeProfile, UserProfile } from "@/types/user";

const KNOWLEDGE_PROFILE_STORE_KEY = "novicereader_knowledge_profiles";
const KNOWLEDGE_PROFILE_INDEX_STORE_KEY = "novicereader_knowledge_profile_index";
const SELECTED_KNOWLEDGE_PROFILE_STORE_KEY =
  "novicereader_selected_knowledge_profiles";

export const DEFAULT_KNOWLEDGE_DESCRIPTION =
  "Assume a curious high-school student who may need technical terms, math notation, and research methods explained from first principles.";

export const DEFAULT_KNOWLEDGE_PROFILE_NAME = "Highschool";

const LEGACY_DEFAULT_KNOWLEDGE_PROFILE_NAME = "Default";

export const DEFAULT_KNOWLEDGE_PROFILE: UserKnowledgeProfile = {
  educationLevel: "high_school",
  assumedFromEmptyOnboarding: true,
  backgroundSummary: "",
  knownCourses: [],
  knownConcepts: [],
  knownDomains: [],
  learningGoals: [],
  weakAreas: [],
  explanationPreference: "beginner-friendly",
  explanationDepth: "gentle",
};

export type LocalKnowledgeProfileRecord = {
  id: string;
  name: string;
  userId: string;
  username: string;
  displayName: string;
  accountLabel: string;
  isGuest: boolean;
  knowledgeProfile: UserKnowledgeProfile;
  updatedAt: string;
};

export type KnowledgeProfileSummaryRecord = Omit<
  LocalKnowledgeProfileRecord,
  "knowledgeProfile"
> & {
  isSelected: boolean;
};

function getAccountKey({
  userId,
  isGuest,
}: {
  userId: string;
  isGuest: boolean;
}) {
  return `${isGuest ? "guest" : "user"}:${userId}`;
}

function normalizeProfileName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function readSelectedProfileIds(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }

  const rawSelections = window.localStorage.getItem(
    SELECTED_KNOWLEDGE_PROFILE_STORE_KEY,
  );

  if (!rawSelections) {
    return {};
  }

  try {
    const parsedSelections = JSON.parse(rawSelections);

    return parsedSelections && typeof parsedSelections === "object"
      ? (parsedSelections as Record<string, string>)
      : {};
  } catch {
    window.localStorage.removeItem(SELECTED_KNOWLEDGE_PROFILE_STORE_KEY);
    return {};
  }
}

function writeSelectedProfileIds(selectedProfileIds: Record<string, string>) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    SELECTED_KNOWLEDGE_PROFILE_STORE_KEY,
    JSON.stringify(selectedProfileIds),
  );
}

function coerceKnowledgeProfile(
  profile: Partial<UserKnowledgeProfile> | null | undefined,
): UserKnowledgeProfile {
  return {
    ...DEFAULT_KNOWLEDGE_PROFILE,
    ...(profile ?? {}),
    knownCourses: profile?.knownCourses ?? [],
    knownConcepts: profile?.knownConcepts ?? [],
    knownDomains: profile?.knownDomains ?? [],
    learningGoals: profile?.learningGoals ?? [],
    weakAreas: profile?.weakAreas ?? [],
  };
}

function coerceRecord(record: unknown): LocalKnowledgeProfileRecord | null {
  if (!record || typeof record !== "object") {
    return null;
  }

  const candidate = record as Partial<LocalKnowledgeProfileRecord>;

  if (
    typeof candidate.userId !== "string" ||
    typeof candidate.username !== "string" ||
    typeof candidate.displayName !== "string" ||
    typeof candidate.isGuest !== "boolean" ||
    !candidate.knowledgeProfile
  ) {
    return null;
  }

  const timestamp =
    typeof candidate.updatedAt === "string"
      ? candidate.updatedAt
      : new Date().toISOString();
  const normalizedName =
    typeof candidate.name === "string" && candidate.name.trim()
      ? normalizeProfileName(candidate.name)
      : DEFAULT_KNOWLEDGE_PROFILE_NAME;
  const name =
    normalizedName === LEGACY_DEFAULT_KNOWLEDGE_PROFILE_NAME
      ? DEFAULT_KNOWLEDGE_PROFILE_NAME
      : normalizedName;

  return {
    id:
      typeof candidate.id === "string" && candidate.id
        ? candidate.id
        : `legacy-${candidate.isGuest ? "guest" : "user"}-${candidate.userId}`,
    name,
    userId: candidate.userId,
    username: candidate.username,
    displayName: candidate.displayName,
    accountLabel:
      typeof candidate.accountLabel === "string" && candidate.accountLabel
        ? candidate.accountLabel
        : `${candidate.isGuest ? "Guest" : "User"}: ${
            candidate.displayName || candidate.username || candidate.userId
          }`,
    isGuest: candidate.isGuest,
    knowledgeProfile: coerceKnowledgeProfile(candidate.knowledgeProfile),
    updatedAt: timestamp,
  };
}

function readLocalKnowledgeProfileRecords(): LocalKnowledgeProfileRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  const rawRecords = window.localStorage.getItem(KNOWLEDGE_PROFILE_STORE_KEY);

  if (!rawRecords) {
    return [];
  }

  try {
    const parsedRecords = JSON.parse(rawRecords);

    if (!Array.isArray(parsedRecords)) {
      return [];
    }

    return parsedRecords
      .map(coerceRecord)
      .filter((record): record is LocalKnowledgeProfileRecord =>
        Boolean(record),
      );
  } catch {
    window.localStorage.removeItem(KNOWLEDGE_PROFILE_STORE_KEY);
    return [];
  }
}

function readLocalKnowledgeProfileIndex(): Omit<
  KnowledgeProfileSummaryRecord,
  "isSelected"
>[] {
  if (typeof window === "undefined") {
    return [];
  }

  const rawIndex = window.localStorage.getItem(KNOWLEDGE_PROFILE_INDEX_STORE_KEY);

  if (!rawIndex) {
    return [];
  }

  try {
    const parsedIndex = JSON.parse(rawIndex);

    if (!Array.isArray(parsedIndex)) {
      return [];
    }

    return parsedIndex.filter(
      (record): record is Omit<KnowledgeProfileSummaryRecord, "isSelected"> =>
        record &&
        typeof record === "object" &&
        typeof record.id === "string" &&
        typeof record.name === "string" &&
        typeof record.userId === "string" &&
        typeof record.username === "string" &&
        typeof record.displayName === "string" &&
        typeof record.accountLabel === "string" &&
        typeof record.isGuest === "boolean" &&
        typeof record.updatedAt === "string",
    );
  } catch {
    window.localStorage.removeItem(KNOWLEDGE_PROFILE_INDEX_STORE_KEY);
    return [];
  }
}

function writeLocalKnowledgeProfileIndex(records: LocalKnowledgeProfileRecord[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    KNOWLEDGE_PROFILE_INDEX_STORE_KEY,
    JSON.stringify(records.map(getKnowledgeProfileRecordSummary)),
  );
}

function writeLocalKnowledgeProfileRecords(
  records: LocalKnowledgeProfileRecord[],
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    KNOWLEDGE_PROFILE_STORE_KEY,
    JSON.stringify(records),
  );
  writeLocalKnowledgeProfileIndex(records);
}

function sortKnowledgeProfileRecords(records: LocalKnowledgeProfileRecord[]) {
  return [...records].sort(
    (first, second) =>
      new Date(second.updatedAt).getTime() -
      new Date(first.updatedAt).getTime(),
  );
}

function getKnowledgeProfileRecordSummary(record: LocalKnowledgeProfileRecord) {
  return {
    id: record.id,
    name: record.name,
    userId: record.userId,
    username: record.username,
    displayName: record.displayName,
    accountLabel: record.accountLabel,
    isGuest: record.isGuest,
    updatedAt: record.updatedAt,
  };
}

function createLocalKnowledgeProfileRecord({
  user,
  isGuest,
  knowledgeProfile,
  profileId,
  profileName,
}: {
  user: Pick<UserProfile, "id" | "username" | "displayName">;
  isGuest: boolean;
  knowledgeProfile: UserKnowledgeProfile;
  profileId?: string | null;
  profileName: string;
}): LocalKnowledgeProfileRecord {
  return {
    id: profileId || createId(),
    name: profileName,
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    accountLabel: `${isGuest ? "Guest" : "User"}: ${
      user.displayName || user.username || user.id
    }`,
    isGuest,
    knowledgeProfile,
    updatedAt: new Date().toISOString(),
  };
}

export function formatKnowledgeProfileForAi(profile: UserKnowledgeProfile) {
  const description =
    profile.backgroundSummary.trim() || DEFAULT_KNOWLEDGE_DESCRIPTION;
  const domains = profile.knownDomains.length
    ? profile.knownDomains.join(", ")
    : "none provided";
  const weakAreas = profile.weakAreas.length
    ? profile.weakAreas.join(", ")
    : "none provided";

  return [
    `Brief description: ${description}`,
    `Knowledge domains: ${domains}`,
    `Weak areas: ${weakAreas}`,
  ].join("\n");
}

export function getAccountKnowledgeProfileRecords({
  userId,
  isGuest,
}: {
  userId: string;
  isGuest: boolean;
}) {
  return sortKnowledgeProfileRecords(
    readLocalKnowledgeProfileRecords().filter(
      (record) => record.userId === userId && record.isGuest === isGuest,
    ),
  );
}

export function getAccountKnowledgeProfileSummaries({
  userId,
  isGuest,
}: {
  userId: string;
  isGuest: boolean;
}): KnowledgeProfileSummaryRecord[] {
  const accountKey = getAccountKey({ userId, isGuest });
  const selectedProfileId = readSelectedProfileIds()[accountKey];
  let summaries = readLocalKnowledgeProfileIndex().filter(
    (record) => record.userId === userId && record.isGuest === isGuest,
  );

  if (summaries.length === 0) {
    const records = getAccountKnowledgeProfileRecords({ userId, isGuest });
    summaries = records.map(getKnowledgeProfileRecordSummary);
  }

  return [...summaries]
    .sort(
      (first, second) =>
        new Date(second.updatedAt).getTime() -
        new Date(first.updatedAt).getTime(),
    )
    .map((record) => ({
      ...record,
      isSelected: record.id === selectedProfileId,
    }));
}

export function setSelectedLocalKnowledgeProfileRecord({
  userId,
  isGuest,
  profileId,
}: {
  userId: string;
  isGuest: boolean;
  profileId: string;
}) {
  const selectedProfileIds = readSelectedProfileIds();

  selectedProfileIds[getAccountKey({ userId, isGuest })] = profileId;
  writeSelectedProfileIds(selectedProfileIds);
}

export function getLocalKnowledgeProfileRecord({
  userId,
  isGuest,
}: {
  userId: string;
  isGuest: boolean;
}) {
  const records = getAccountKnowledgeProfileRecords({ userId, isGuest });
  const selectedProfileId =
    readSelectedProfileIds()[getAccountKey({ userId, isGuest })];

  return (
    records.find((record) => record.id === selectedProfileId) ??
    records[0] ??
    null
  );
}

export function getUniqueKnowledgeProfileName({
  userId,
  isGuest,
  baseName = DEFAULT_KNOWLEDGE_PROFILE_NAME,
}: {
  userId: string;
  isGuest: boolean;
  baseName?: string;
}) {
  const existingNames = new Set(
    getAccountKnowledgeProfileRecords({ userId, isGuest }).map((record) =>
      record.name.toLowerCase(),
    ),
  );
  const normalizedBaseName =
    normalizeProfileName(baseName) || DEFAULT_KNOWLEDGE_PROFILE_NAME;

  if (!existingNames.has(normalizedBaseName.toLowerCase())) {
    return normalizedBaseName;
  }

  let index = 2;
  let nextName = `${normalizedBaseName} ${index}`;

  while (existingNames.has(nextName.toLowerCase())) {
    index += 1;
    nextName = `${normalizedBaseName} ${index}`;
  }

  return nextName;
}

export function saveLocalKnowledgeProfileRecord({
  user,
  isGuest,
  knowledgeProfile,
  profileId,
  profileName = DEFAULT_KNOWLEDGE_PROFILE_NAME,
  makeActive = true,
  replaceDuplicateName = false,
}: {
  user: Pick<UserProfile, "id" | "username" | "displayName">;
  isGuest: boolean;
  knowledgeProfile: UserKnowledgeProfile;
  profileId?: string | null;
  profileName?: string;
  makeActive?: boolean;
  replaceDuplicateName?: boolean;
}) {
  const normalizedProfileName = normalizeProfileName(profileName);

  if (!normalizedProfileName) {
    throw new Error("Profile name is required.");
  }

  const currentRecords = readLocalKnowledgeProfileRecords();
  const duplicateName = currentRecords.find(
    (record) =>
      record.userId === user.id &&
      record.isGuest === isGuest &&
      record.id !== profileId &&
      record.name.toLowerCase() === normalizedProfileName.toLowerCase(),
  );

  if (duplicateName && !replaceDuplicateName) {
    throw new Error("Each profile needs a unique name.");
  }

  const nextRecord = createLocalKnowledgeProfileRecord({
    user,
    isGuest,
    knowledgeProfile,
    profileId,
    profileName: normalizedProfileName,
  });
  const nextRecords = currentRecords.filter(
    (record) =>
      record.id !== nextRecord.id &&
      !(
        replaceDuplicateName &&
        record.userId === user.id &&
        record.isGuest === isGuest &&
        record.name.toLowerCase() === normalizedProfileName.toLowerCase()
      ),
  );

  writeLocalKnowledgeProfileRecords([...nextRecords, nextRecord]);

  if (makeActive) {
    setSelectedLocalKnowledgeProfileRecord({
      userId: user.id,
      isGuest,
      profileId: nextRecord.id,
    });
  }

  return nextRecord;
}

export function deleteLocalKnowledgeProfileRecord({
  user,
  isGuest,
  profileId,
}: {
  user: Pick<UserProfile, "id" | "username" | "displayName">;
  isGuest: boolean;
  profileId: string;
}) {
  const accountKey = getAccountKey({ userId: user.id, isGuest });
  const currentRecords = readLocalKnowledgeProfileRecords();
  const deletedRecord =
    currentRecords.find(
      (record) =>
        record.userId === user.id &&
        record.isGuest === isGuest &&
        record.id === profileId,
    ) ?? null;
  const recordsAfterDelete = currentRecords.filter(
    (record) =>
      !(
        record.userId === user.id &&
        record.isGuest === isGuest &&
        record.id === profileId
      ),
  );
  const remainingAccountRecords = sortKnowledgeProfileRecords(
    recordsAfterDelete.filter(
      (record) => record.userId === user.id && record.isGuest === isGuest,
    ),
  );
  const selectedProfileIds = readSelectedProfileIds();
  let nextRecords = recordsAfterDelete;
  let selectedRecord =
    remainingAccountRecords.find(
      (record) => record.id === selectedProfileIds[accountKey],
    ) ??
    remainingAccountRecords[0] ??
    null;
  let createdDefault = false;

  if (!selectedRecord) {
    selectedRecord = createLocalKnowledgeProfileRecord({
      user,
      isGuest,
      knowledgeProfile: DEFAULT_KNOWLEDGE_PROFILE,
      profileName: DEFAULT_KNOWLEDGE_PROFILE_NAME,
    });
    nextRecords = [...recordsAfterDelete, selectedRecord];
    createdDefault = true;
  }

  writeLocalKnowledgeProfileRecords(nextRecords);
  selectedProfileIds[accountKey] = selectedRecord.id;
  writeSelectedProfileIds(selectedProfileIds);

  return {
    deletedRecord,
    selectedRecord,
    createdDefault,
    records: getAccountKnowledgeProfileRecords({
      userId: user.id,
      isGuest,
    }),
  };
}
