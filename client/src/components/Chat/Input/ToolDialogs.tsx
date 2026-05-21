import React, { useMemo } from 'react';
import { AuthType } from 'librechat-data-provider';
import CodeApiKeyDialog from '~/components/SidePanel/Agents/Code/ApiKeyDialog';
import { useBadgeRowContext } from '~/Providers';

function ToolDialogs() {
  const { codeInterpreter, codeApiKeyForm } = useBadgeRowContext();
  const { authData: codeAuthData } = codeInterpreter;

  const {
    methods: codeMethods,
    onSubmit: codeOnSubmit,
    isDialogOpen: codeDialogOpen,
    setIsDialogOpen: setCodeDialogOpen,
    handleRevokeApiKey: codeHandleRevoke,
    badgeTriggerRef: codeBadgeTriggerRef,
    menuTriggerRef: codeMenuTriggerRef,
  } = codeApiKeyForm;

  const codeAuthType = useMemo(() => codeAuthData?.message ?? false, [codeAuthData?.message]);

  return (
    <>
      <CodeApiKeyDialog
        onSubmit={codeOnSubmit}
        isOpen={codeDialogOpen}
        onRevoke={codeHandleRevoke}
        register={codeMethods.register}
        onOpenChange={setCodeDialogOpen}
        handleSubmit={codeMethods.handleSubmit}
        triggerRefs={[codeMenuTriggerRef, codeBadgeTriggerRef]}
        isUserProvided={codeAuthType === AuthType.USER_PROVIDED}
        isToolAuthenticated={codeAuthData?.authenticated ?? false}
      />
    </>
  );
}

export default ToolDialogs;
