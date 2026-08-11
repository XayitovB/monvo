import React, { useState, useCallback } from 'react';
import ConfirmModal from '../kit/ConfirmModal';

export function useConfirm() {
  const [state, setState] = useState(null);

  const confirm = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      setState({ message, resolve, ...opts });
    });
  }, []);

  const handleResult = (result) => {
    state?.resolve(result);
    setState(null);
  };

  const modal = state ? (
    <ConfirmModal
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      danger={state.danger !== false}
      onConfirm={() => handleResult(true)}
      onCancel={() => handleResult(false)}
    />
  ) : null;

  return [confirm, modal];
}
