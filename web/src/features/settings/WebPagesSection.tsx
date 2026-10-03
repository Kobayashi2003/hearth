import { SettingsGroup } from '@/ui/Field';
import { SettingSwitch, useAdminSettings } from './admin-settings';

/** What an .html file may do when opened. Each switch depends on the ones above it. */
export function WebPagesSection() {
  const { find } = useAdminSettings();
  const viewer = find('htmlViewerEnabled')?.value === true;
  const local = viewer && find('htmlLocalResources')?.value === true;
  return (
    <>
      <SettingsGroup title="Opening pages">
        <SettingSwitch
          name="htmlViewerEnabled"
          title="Open .html files"
          description="Off, they can only be downloaded."
        />
        <SettingSwitch
          name="htmlLocalResources"
          title="Use the files beside a page"
          description="Its images, styles, frames and linked pages, from its own folder down. Off, the page is shown on its own."
          disabled={!viewer}
        />
        <SettingSwitch
          name="htmlExternalResources"
          title="Load images and styles from other sites"
          description="Off keeps a saved page from telling another site that it was opened."
          disabled={!viewer}
        />
      </SettingsGroup>

      <SettingsGroup
        title="Old sites"
        description="For saved sites built on scripts, Flash and plugin video. All need the files beside the page. Scripts and Flash run sealed off from Hearth: a page cannot see your session or reach other files."
      >
        <SettingSwitch
          name="htmlScripts"
          title="Run the page’s own scripts"
          description="Menus, galleries and pages that add their Flash with a script. With other sites allowed above, a page’s scripts can also send what is in its folder to them."
          disabled={!local}
        />
        <SettingSwitch
          name="htmlRuffle"
          title="Play Flash with Ruffle"
          description="Embedded .swf movies play in the page."
          disabled={!local}
        />
        <SettingSwitch
          name="htmlVideo"
          title="Play embedded videos"
          description="Video placed for QuickTime or Windows Media plays in the browser’s own player; what it cannot decode is converted while it plays, which takes the server some work."
          disabled={!local}
        />
      </SettingsGroup>
    </>
  );
}
