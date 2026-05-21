import React, { useState, useCallback } from 'react';
import * as Ariakit from '@ariakit/react';
import { Globe, Settings2 } from 'lucide-react';
import { TooltipAnchor, DropdownPopup, PinIcon, VectorIcon } from '@librechat/client';
import type { MenuItemProps } from '~/common';
import {
  Permissions,
  ArtifactModes,
  PermissionTypes,
  defaultAgentCapabilities,
} from 'librechat-data-provider';
import { useLocalize, useHasAccess, useAgentCapabilities } from '~/hooks';
import ArtifactsSubMenu from '~/components/Chat/Input/ArtifactsSubMenu';
import MCPSubMenu from '~/components/Chat/Input/MCPSubMenu';
import { useGetStartupConfig } from '~/data-provider';
import { useBadgeRowContext } from '~/Providers';
import { cn } from '~/utils';

interface ToolsDropdownProps {
  disabled?: boolean;
}

function ToolsDropdown({ disabled }: ToolsDropdownProps) {
  const localize = useLocalize();
  const isDisabled = disabled ?? false;
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const { webSearch, artifacts, fileSearch, agentsConfig, mcpServerManager } = useBadgeRowContext();
  const { data: startupConfig } = useGetStartupConfig();

  const { webSearchEnabled, artifactsEnabled, fileSearchEnabled } = useAgentCapabilities(
    agentsConfig?.capabilities ?? defaultAgentCapabilities,
  );

  const { isPinned: isSearchPinned, setIsPinned: setIsSearchPinned } = webSearch;
  const { isPinned: isFileSearchPinned, setIsPinned: setIsFileSearchPinned } = fileSearch;
  const { isPinned: isArtifactsPinned, setIsPinned: setIsArtifactsPinned } = artifacts;

  const canUseWebSearch = useHasAccess({
    permissionType: PermissionTypes.WEB_SEARCH,
    permission: Permissions.USE,
  });

  const canUseFileSearch = useHasAccess({
    permissionType: PermissionTypes.FILE_SEARCH,
    permission: Permissions.USE,
  });

  const canUseMcp = useHasAccess({
    permissionType: PermissionTypes.MCP_SERVERS,
    permission: Permissions.USE,
  });

  const handleWebSearchToggle = useCallback(() => {
    const newValue = !webSearch.toggleState;
    webSearch.debouncedChange({ value: newValue });
  }, [webSearch]);

  const handleFileSearchToggle = useCallback(() => {
    const newValue = !fileSearch.toggleState;
    fileSearch.debouncedChange({ value: newValue });
  }, [fileSearch]);

  const handleArtifactsToggle = useCallback(() => {
    const currentState = artifacts.toggleState;
    if (!currentState || currentState === '') {
      artifacts.debouncedChange({ value: ArtifactModes.DEFAULT });
    } else {
      artifacts.debouncedChange({ value: '' });
    }
  }, [artifacts]);

  const handleShadcnToggle = useCallback(() => {
    const currentState = artifacts.toggleState;
    if (currentState === ArtifactModes.SHADCNUI) {
      artifacts.debouncedChange({ value: ArtifactModes.DEFAULT });
    } else {
      artifacts.debouncedChange({ value: ArtifactModes.SHADCNUI });
    }
  }, [artifacts]);

  const handleCustomToggle = useCallback(() => {
    const currentState = artifacts.toggleState;
    if (currentState === ArtifactModes.CUSTOM) {
      artifacts.debouncedChange({ value: ArtifactModes.DEFAULT });
    } else {
      artifacts.debouncedChange({ value: ArtifactModes.CUSTOM });
    }
  }, [artifacts]);

  const mcpPlaceholder = startupConfig?.interface?.mcpServers?.placeholder;

  const dropdownItems: MenuItemProps[] = [];

  if (fileSearchEnabled && canUseFileSearch) {
    dropdownItems.push({
      onClick: handleFileSearchToggle,
      hideOnClick: false,
      render: (props) => (
        <div {...props}>
          <div className="flex items-center gap-2">
            <VectorIcon className="icon-md" />
            <span>{localize('com_assistants_file_search')}</span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsFileSearchPinned(!isFileSearchPinned);
            }}
            className={cn(
              'rounded p-1 transition-all duration-200',
              'hover:bg-surface-secondary hover:shadow-sm',
              !isFileSearchPinned && 'text-text-secondary hover:text-text-primary',
            )}
            aria-label={localize(isFileSearchPinned ? 'com_ui_unpin' : 'com_ui_pin')}
          >
            <div className="h-4 w-4">
              <PinIcon unpin={isFileSearchPinned} />
            </div>
          </button>
        </div>
      ),
    });
  }

  if (canUseWebSearch && webSearchEnabled) {
    dropdownItems.push({
      onClick: handleWebSearchToggle,
      hideOnClick: false,
      render: (props) => (
        <div {...props}>
          <div className="flex items-center gap-2">
            <Globe className="icon-md" aria-hidden="true" />
            <span>{localize('com_ui_web_search')}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsSearchPinned(!isSearchPinned);
              }}
              className={cn(
                'rounded p-1 transition-all duration-200',
                'hover:bg-surface-secondary hover:shadow-sm',
                !isSearchPinned && 'text-text-secondary hover:text-text-primary',
              )}
              aria-label={localize(isSearchPinned ? 'com_ui_unpin' : 'com_ui_pin')}
            >
              <div className="h-4 w-4">
                <PinIcon unpin={isSearchPinned} />
              </div>
            </button>
          </div>
        </div>
      ),
    });
  }

  if (artifactsEnabled) {
    dropdownItems.push({
      hideOnClick: false,
      render: (props) => (
        <ArtifactsSubMenu
          {...props}
          isArtifactsPinned={isArtifactsPinned}
          setIsArtifactsPinned={setIsArtifactsPinned}
          artifactsMode={artifacts.toggleState as string}
          handleArtifactsToggle={handleArtifactsToggle}
          handleShadcnToggle={handleShadcnToggle}
          handleCustomToggle={handleCustomToggle}
        />
      ),
    });
  }

  const { availableMCPServers } = mcpServerManager;
  if (canUseMcp && availableMCPServers && availableMCPServers.length > 0) {
    dropdownItems.push({
      hideOnClick: false,
      render: (props) => <MCPSubMenu {...props} placeholder={mcpPlaceholder} />,
    });
  }

  if (dropdownItems.length === 0) {
    return null;
  }

  const menuTrigger = (
    <TooltipAnchor
      render={
        <Ariakit.MenuButton
          disabled={isDisabled}
          id="tools-dropdown-button"
          aria-label={localize('com_ui_tools')}
          className={cn(
            'flex size-9 items-center justify-center rounded-full p-1 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
            isPopoverActive && 'bg-surface-hover',
          )}
        >
          <div className="flex w-full items-center justify-center gap-2">
            <Settings2 className="size-5" aria-hidden="true" />
          </div>
        </Ariakit.MenuButton>
      }
      id="tools-dropdown-button"
      description={localize('com_ui_tools')}
      disabled={isDisabled}
    />
  );

  return (
    <DropdownPopup
      itemClassName="flex w-full cursor-pointer rounded-lg items-center justify-between hover:bg-surface-hover gap-5"
      menuId="tools-dropdown-menu"
      isOpen={isPopoverActive}
      setIsOpen={setIsPopoverActive}
      modal={true}
      unmountOnHide={true}
      trigger={menuTrigger}
      items={dropdownItems}
      iconClassName="mr-0"
    />
  );
}

const MemoizedToolsDropdown = React.memo(ToolsDropdown);

export default MemoizedToolsDropdown;
