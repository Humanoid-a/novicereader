"use client";

import { AppMenu } from "@/components/AppMenu";
import { KnowledgeProfilePresetPicker } from "@/components/KnowledgeProfilePresetPicker";
import {
  getCurrentUser,
  getStoredAuthToken,
} from "@/lib/api";
import {
  getGuestUserProfile,
  isGuestSessionActive,
} from "@/lib/guestSession";
import {
  deleteKnowledgeProfileForAccount,
  loadKnowledgeProfileRecordsForAccount,
  saveKnowledgeProfileForAccount,
  selectKnowledgeProfileForAccount,
} from "@/lib/knowledgeProfileSync";
import {
  DEFAULT_KNOWLEDGE_DESCRIPTION,
  DEFAULT_KNOWLEDGE_PROFILE,
  DEFAULT_KNOWLEDGE_PROFILE_NAME,
  formatKnowledgeProfileForAi,
  getAccountKnowledgeProfileRecords,
  getLocalKnowledgeProfileRecord,
  getUniqueKnowledgeProfileName,
  type LocalKnowledgeProfileRecord,
} from "@/lib/knowledgeProfileStore";
import type { KnowledgeProfilePreset } from "@/lib/knowledgeProfilePresets";
import type { UserKnowledgeProfile, UserProfile } from "@/types/user";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

type KnowledgeProfileForm = {
  backgroundSummary: string;
  knownDomainsText: string;
  weakAreasText: string;
};

function joinList(values: string[]) {
  return values.join("\n");
}

function splitList(value: string) {
  const seen = new Set<string>();
  const items = value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return items.filter((item) => {
    const normalized = item.toLowerCase();

    if (seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

function getInitialForm(profile = DEFAULT_KNOWLEDGE_PROFILE): KnowledgeProfileForm {
  return {
    backgroundSummary: profile.assumedFromEmptyOnboarding
      ? ""
      : profile.backgroundSummary,
    knownDomainsText: joinList(profile.knownDomains),
    weakAreasText: joinList(profile.weakAreas),
  };
}

function buildKnowledgeProfile(form: KnowledgeProfileForm): UserKnowledgeProfile {
  const backgroundSummary = form.backgroundSummary.trim();
  const knownDomains = splitList(form.knownDomainsText);
  const weakAreas = splitList(form.weakAreasText);
  const hasUserProfile =
    Boolean(backgroundSummary) ||
    knownDomains.length > 0 ||
    weakAreas.length > 0;

  return {
    ...DEFAULT_KNOWLEDGE_PROFILE,
    assumedFromEmptyOnboarding: !hasUserProfile,
    backgroundSummary,
    knownDomains,
    weakAreas,
  };
}

export default function ProfilePage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [profileRecords, setProfileRecords] = useState<
    LocalKnowledgeProfileRecord[]
  >([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null
  );
  const [profileName, setProfileName] = useState(DEFAULT_KNOWLEDGE_PROFILE_NAME);
  const [form, setForm] = useState<KnowledgeProfileForm>(
    getInitialForm(DEFAULT_KNOWLEDGE_PROFILE)
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isPresetPickerOpen, setIsPresetPickerOpen] = useState(false);
  const [presetSearch, setPresetSearch] = useState("");
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let isMounted = true;
    const hasStoredAuthToken = Boolean(getStoredAuthToken());
    const hasGuestSession = isGuestSessionActive();

    if (!hasStoredAuthToken && !hasGuestSession) {
      router.replace("/login");
      return () => {
        isMounted = false;
      };
    }

    if (hasGuestSession && !hasStoredAuthToken) {
      const guestProfile = getGuestUserProfile();
      const localProfiles = getAccountKnowledgeProfileRecords({
        userId: guestProfile.id,
        isGuest: true,
      });
      const selectedRecord =
        getLocalKnowledgeProfileRecord({
          userId: guestProfile.id,
          isGuest: true,
        }) ?? null;
      const localProfile =
        selectedRecord?.knowledgeProfile ?? guestProfile.knowledgeProfile;

      setIsGuestMode(true);
      setProfileRecords(localProfiles);
      setSelectedProfileId(selectedRecord?.id ?? null);
      setProfileName(
        selectedRecord?.name ??
          getUniqueKnowledgeProfileName({
            userId: guestProfile.id,
            isGuest: true,
          })
      );
      setCurrentUser({
        ...guestProfile,
        knowledgeProfile: localProfile,
      });
      setForm(getInitialForm(localProfile));
      setIsLoading(false);

      return () => {
        isMounted = false;
      };
    }

    async function loadProfile() {
      try {
        setIsLoading(true);
        setError("");

        const user = await getCurrentUser();
        const localProfiles = await loadKnowledgeProfileRecordsForAccount({
          user,
          isGuest: false,
        });
        const selectedRecord =
          getLocalKnowledgeProfileRecord({
            userId: user.id,
            isGuest: false,
          }) ?? null;
        const localProfile =
          selectedRecord?.knowledgeProfile ?? user.knowledgeProfile;

        if (isMounted) {
          setIsGuestMode(false);
          setProfileRecords(localProfiles);
          setSelectedProfileId(selectedRecord?.id ?? null);
          setProfileName(
            selectedRecord?.name ??
              getUniqueKnowledgeProfileName({
                userId: user.id,
                isGuest: false,
              })
          );
          setCurrentUser({
            ...user,
            knowledgeProfile: localProfile,
          });
          setForm(getInitialForm(localProfile));
        }
      } catch (error) {
        console.error(error);

        if (isMounted) {
          router.replace("/login");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (!isProfileMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (
        target instanceof Node &&
        profileMenuRef.current?.contains(target)
      ) {
        return;
      }

      setIsProfileMenuOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isProfileMenuOpen]);

  const profilePreview = useMemo(() => buildKnowledgeProfile(form), [form]);
  const profilePreviewText = useMemo(
    () => formatKnowledgeProfileForAi(profilePreview),
    [profilePreview]
  );

  function updateForm<Field extends keyof KnowledgeProfileForm>(
    field: Field,
    value: KnowledgeProfileForm[Field]
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
    setSavedMessage("");
  }

  async function handleProfileSelection(profileId: string) {
    const profileRecord = profileRecords.find((record) => record.id === profileId);

    if (!profileRecord || !currentUser) {
      return;
    }

    try {
      await selectKnowledgeProfileForAccount({
        user: currentUser,
        isGuest: isGuestMode,
        profileId,
      });
    } catch (error) {
      console.error(error);
      setError(
        error instanceof Error ? error.message : "Failed to select profile."
      );
      return;
    }

    setSelectedProfileId(profileRecord.id);
    setProfileName(profileRecord.name);
    setCurrentUser({
      ...currentUser,
      knowledgeProfile: profileRecord.knowledgeProfile,
    });
    setForm(getInitialForm(profileRecord.knowledgeProfile));
    setSavedMessage("");
    setIsProfileMenuOpen(false);
  }

  function handleNewProfile() {
    setPresetSearch("");
    setIsPresetPickerOpen(true);
    setSavedMessage("");
    setError("");
    setIsProfileMenuOpen(false);
  }

  function closePresetPicker() {
    setIsPresetPickerOpen(false);
    setPresetSearch("");
  }

  function choosePreset(preset: KnowledgeProfilePreset) {
    if (!currentUser) {
      return;
    }

    setSelectedProfileId(null);
    setProfileName(
      getUniqueKnowledgeProfileName({
        userId: currentUser.id,
        isGuest: isGuestMode,
        baseName: preset.defaultName,
      })
    );
    setForm(getInitialForm(preset.knowledgeProfile));
    setSavedMessage("");
    setError("");
    setIsPresetPickerOpen(false);
    setPresetSearch("");
    setIsProfileMenuOpen(false);
  }

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setSavedMessage("");

    try {
      if (!currentUser) {
        throw new Error("No active user profile.");
      }

      const nextProfile = buildKnowledgeProfile(form);
      const savedRecord = await saveKnowledgeProfileForAccount({
        user: currentUser,
        isGuest: isGuestMode,
        knowledgeProfile: nextProfile,
        profileId: selectedProfileId,
        profileName,
      });
      const updatedRecords = getAccountKnowledgeProfileRecords({
        userId: currentUser.id,
        isGuest: isGuestMode,
      });
      const updatedUser = {
        ...currentUser,
        knowledgeProfile: savedRecord.knowledgeProfile,
        selectedKnowledgeProfileId: savedRecord.id,
      };

      setProfileRecords(updatedRecords);
      setSelectedProfileId(savedRecord.id);
      setProfileName(savedRecord.name);
      setCurrentUser(updatedUser);
      setForm(getInitialForm(updatedUser.knowledgeProfile));
      setSavedMessage("Saved");
    } catch (error) {
      console.error(error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to save knowledge profile."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteCurrentProfile() {
    if (!currentUser || !selectedProfileId) {
      return;
    }

    const shouldDelete = window.confirm("Delete this profile?");

    if (!shouldDelete) {
      return;
    }

    setIsDeleting(true);
    setError("");
    setSavedMessage("");

    try {
      const result = await deleteKnowledgeProfileForAccount({
        user: currentUser,
        isGuest: isGuestMode,
        profileId: selectedProfileId,
      });
      const selectedRecord = result.selectedRecord ?? result.records[0];

      if (!selectedRecord) {
        throw new Error("No profile available after delete.");
      }
      const nextUser = {
        ...currentUser,
        knowledgeProfile: selectedRecord.knowledgeProfile,
        selectedKnowledgeProfileId: selectedRecord.id,
      };

      setProfileRecords(result.records);
      setSelectedProfileId(selectedRecord.id);
      setProfileName(selectedRecord.name);
      setCurrentUser(nextUser);
      setForm(getInitialForm(selectedRecord.knowledgeProfile));
      setIsProfileMenuOpen(false);
      setSavedMessage(result.createdDefault ? "Default created" : "Deleted");
    } catch (error) {
      console.error(error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to delete knowledge profile."
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white px-5">
        <div className="flex min-w-0 items-center gap-3">
          <AppMenu />
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-950">
              Knowledge Profile
            </h1>
            <p className="truncate text-xs text-slate-500">
              {currentUser?.displayName || "Reader"}
              {isGuestMode ? " - Guest session" : ""}
            </p>
          </div>
        </div>

        <Link
          href="/"
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
        >
          Home
        </Link>
      </header>

      <section className="mx-auto grid w-full max-w-5xl gap-5 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <form
          onSubmit={handleSaveProfile}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Reader background
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">
                Describe what you already know
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {savedMessage && (
                <span className="text-sm font-medium text-emerald-700">
                  {savedMessage}
                </span>
              )}
              <button
                type="button"
                onClick={handleDeleteCurrentProfile}
                disabled={
                  isLoading || isSaving || isDeleting || !selectedProfileId
                }
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-100 text-red-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                title="Delete current profile"
                aria-label="Delete current profile"
              >
                {isDeleting ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border border-red-200 border-t-red-600" />
                ) : (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  >
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v5" />
                    <path d="M14 11v5" />
                  </svg>
                )}
              </button>
              <button
                type="submit"
                disabled={isLoading || isSaving || isDeleting}
                className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex min-h-80 items-center justify-center text-sm text-slate-500">
              Loading profile...
            </div>
          ) : (
            <div className="space-y-5">
              <div ref={profileMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setIsProfileMenuOpen((isOpen) => !isOpen)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:border-slate-300 hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
                  aria-expanded={isProfileMenuOpen}
                  aria-haspopup="listbox"
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Current profile
                    </span>
                    <span className="mt-0.5 block truncate text-sm font-semibold text-slate-950">
                      {profileName || DEFAULT_KNOWLEDGE_PROFILE_NAME}
                    </span>
                  </span>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    className={`h-4 w-4 shrink-0 text-slate-500 transition ${
                      isProfileMenuOpen ? "rotate-180" : ""
                    }`}
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>

                {isProfileMenuOpen && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                    <div
                      role="listbox"
                      aria-label="Knowledge profiles"
                      className="max-h-56 overflow-auto p-1.5"
                    >
                      {profileRecords.length > 0 ? (
                        profileRecords.map((record) => {
                          const isActive = selectedProfileId === record.id;

                          return (
                            <button
                              key={record.id}
                              type="button"
                              onClick={() => handleProfileSelection(record.id)}
                              role="option"
                              aria-selected={isActive}
                              className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm transition ${
                                isActive
                                  ? "bg-slate-900 text-white"
                                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                              }`}
                            >
                              <span className="min-w-0 truncate font-medium">
                                {record.name}
                              </span>
                              {isActive && (
                                <span className="text-xs font-medium opacity-80">
                                  Active
                                </span>
                              )}
                            </button>
                          );
                        })
                      ) : (
                        <p className="px-2.5 py-3 text-sm text-slate-500">
                          No saved profiles yet.
                        </p>
                      )}
                    </div>

                    <div className="border-t border-slate-100 p-1.5">
                      <button
                        type="button"
                        onClick={handleNewProfile}
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-950"
                      >
                        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-base leading-none">
                          +
                        </span>
                        <span>New</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {profileRecords.length > 0 && (
                <p className="text-xs text-slate-400">
                  {profileRecords.length} saved
                </p>
              )}

              <div>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Profile name
                  </span>
                  <input
                    value={profileName}
                    onChange={(event) => {
                      setProfileName(event.target.value);
                      setSavedMessage("");
                    }}
                    placeholder={DEFAULT_KNOWLEDGE_PROFILE_NAME}
                    required
                    className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Brief knowledge description
                </span>
                <textarea
                  value={form.backgroundSummary}
                  onChange={(event) =>
                    updateForm("backgroundSummary", event.target.value)
                  }
                  rows={7}
                  placeholder={DEFAULT_KNOWLEDGE_DESCRIPTION}
                  className="mt-2 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <ListTextarea
                  label="Knowledge domains"
                  value={form.knownDomainsText}
                  onChange={(value) => updateForm("knownDomainsText", value)}
                  placeholder={"e.g. neuroscience\ne.g. computer science"}
                />
                <ListTextarea
                  label="Weak areas"
                  value={form.weakAreasText}
                  onChange={(value) => updateForm("weakAreasText", value)}
                  placeholder={"e.g. math\ne.g. probability notation"}
                />
              </div>
            </div>
          )}
        </form>

        <aside className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-5 lg:self-start">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-950">
              Preview
            </h2>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                profilePreview.assumedFromEmptyOnboarding
                  ? "bg-slate-100 text-slate-500"
                  : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {profilePreview.assumedFromEmptyOnboarding
                ? "Default"
                : "Customized"}
            </span>
          </div>
          <pre className="mt-4 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
            {profilePreviewText}
          </pre>
        </aside>
      </section>

      {isPresetPickerOpen && (
        <KnowledgeProfilePresetPicker
          search={presetSearch}
          onSearchChange={setPresetSearch}
          onChoosePreset={choosePreset}
          onClose={closePresetPicker}
        />
      )}
    </main>
  );
}

function ListTextarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
        placeholder={placeholder}
        className="mt-2 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
      />
    </label>
  );
}
