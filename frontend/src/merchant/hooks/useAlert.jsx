import React, { useState, useCallback } from 'react';
import AlertModal from '../kit/AlertModal';

export function useAlert() {
  const [state, setState] = useState(null);

  const showAlert = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      setState({ message, resolve, ...opts });
    });
  }, []);

  const handleClose = () => {
    state?.resolve();
    setState(null);
  };

  const modal = state ? (
    <AlertModal
      message={state.message}
      title={state.title}
      variant={state.variant || 'error'}
      okLabel={state.okLabel}
      onClose={handleClose}
    />
  ) : null;

  return [showAlert, modal];
}
