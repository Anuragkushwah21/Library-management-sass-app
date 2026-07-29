'use client';

import { ReactNode } from 'react';
import { Flip, ToastContainer } from 'react-toastify';
import { useTheme } from 'next-themes';
import 'react-toastify/dist/ReactToastify.css';

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  // resolvedTheme, kyunki "system" react-toastify ke liye valid value nahi hai
  const { resolvedTheme } = useTheme();

  return (
    <>
      {children}
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
        transition={Flip}
      />
    </>
  );
}