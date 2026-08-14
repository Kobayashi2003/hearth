import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Command, MoreVertical, Rows2, Rows3, Settings, Upload } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { menuContentClass, menuItemClass } from '@/components/ui/Menu';
import type { Density } from '@/features/hob/usePreferences';

/**
 * The secondary toolbar actions, collapsed into one menu on a phone where a
 * full row of icon buttons would crush the search field. The same actions stay
 * inline on a wider screen (see the toolbar), so this is shown only below `md`.
 */
export function ToolbarOverflow({
  density,
  canWrite,
  onOpenPalette,
  onDensityChange,
  onUpload,
  onOpenSettings,
}: {
  density: Density;
  canWrite: boolean;
  onOpenPalette: () => void;
  onDensityChange: (density: Density) => void;
  onUpload: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="More actions">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={6}
          align="end"
          className={`${menuContentClass} min-w-48`}
        >
          <DropdownMenu.Item className={menuItemClass} onSelect={onOpenPalette}>
            <Command className="h-4 w-4" /> Command palette
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={menuItemClass}
            onSelect={() => onDensityChange(density === 'comfortable' ? 'compact' : 'comfortable')}
          >
            {density === 'comfortable' ? (
              <Rows2 className="h-4 w-4" />
            ) : (
              <Rows3 className="h-4 w-4" />
            )}
            {density === 'comfortable' ? 'Compact rows' : 'Comfortable rows'}
          </DropdownMenu.Item>

          {canWrite ? (
            <DropdownMenu.Item className={menuItemClass} onSelect={onUpload}>
              <Upload className="h-4 w-4" /> Upload
            </DropdownMenu.Item>
          ) : null}

          <DropdownMenu.Item className={menuItemClass} onSelect={onOpenSettings}>
            <Settings className="h-4 w-4" /> Settings
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
