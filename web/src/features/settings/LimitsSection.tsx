import { SettingsGroup } from '@/ui/Field';
import { SettingNumber } from './admin-settings';

/**
 * The caps an administrator can change while Hearth runs. Each starts from
 * .env; the rest of .env's limits (request size, rate limits, session length)
 * are fixed when the server starts.
 */
export function LimitsSection() {
  return (
    <div>
      <SettingsGroup title="Browsing and search">
        <SettingNumber
          name="listingMaxEntries"
          title="Items in one folder or search"
          description="Past it the list shows the first part and says so."
        />
        <SettingNumber
          name="searchMaxResults"
          title="Search results"
          description="How many matches one search collects before it stops."
        />
        <SettingNumber
          name="everythingTimeoutMs"
          title="Everything timeout"
          description="How long to wait for Everything before searching by walking the folders. Always limited: a hung Everything must not hang every search."
        />
      </SettingsGroup>

      <SettingsGroup title="Files">
        <SettingNumber name="maxUploadSizeMB" title="Largest upload" />
        <SettingNumber
          name="maxTextSizeMB"
          title="Largest text file shown in full"
          description="Bigger files show their beginning."
        />
        <SettingNumber
          name="archiveMaxEntries"
          title="Items listed in an archive"
          description="Search inside an archive covers the listed part."
        />
        <SettingNumber
          name="archiveMaxMemberSizeMB"
          title="Largest file opened inside an archive"
          description="Bigger ones have to be downloaded with the archive."
        />
      </SettingsGroup>

      <SettingsGroup title="Folder covers">
        <SettingNumber
          name="folderCoverMaxDepth"
          title="Levels searched for a cover"
          description="Always limited: on a large tree an unbounded scan would walk the whole drive for one tile."
        />
        <SettingNumber name="folderCoverMaxBranches" title="Subfolders tried at each level" />
      </SettingsGroup>

      <p className="mt-2 max-w-prose px-1 text-[12.5px] text-ink-3">
        Each starts from the server’s .env and can be changed here without a restart. The other
        limits in .env (request size, rate limits, how long a sign-in lasts) apply when the server
        starts.
      </p>
    </div>
  );
}
