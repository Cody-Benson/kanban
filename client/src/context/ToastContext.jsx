import { createContext, useContext, useState, useCallback } from 'react';
import { Snackbar, Alert } from '@mui/material';

// Single app-level snackbar so any component can surface a transient
// warning/info message without each one wiring its own Snackbar. Used
// primarily to surface non-fatal Google sync errors that the server now
// returns in API responses instead of swallowing into console.error.
const ToastContext = createContext({ show: () => {} });

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null); // { message, severity }

  const show = useCallback((message, severity = 'info') => {
    if (!message) return;
    setToast({ message, severity });
  }, []);

  const handleClose = (_event, reason) => {
    // Don't auto-dismiss on background clicks — only on timeout or explicit close.
    if (reason === 'clickaway') return;
    setToast(null);
  };

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <Snackbar
        open={!!toast}
        autoHideDuration={8000}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert
            severity={toast.severity}
            onClose={() => setToast(null)}
            variant="filled"
            sx={{ maxWidth: 600 }}
          >
            {toast.message}
          </Alert>
        ) : null}
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
