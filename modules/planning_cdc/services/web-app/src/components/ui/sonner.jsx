import { Toaster as Sonner } from "sonner";

/**
 * Global toast notifier (Sonner) preconfigured with the project's branding,
 * positioning and rich colour palette. Mount once near the app root.
 *
 * @param {object} props — forwarded to the underlying Sonner toaster
 * @returns {JSX.Element}
 */
const Toaster = (props) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-white group-[.toaster]:text-gray-900 group-[.toaster]:border-gray-200 group-[.toaster]:shadow-lg group-[.toaster]:rounded-lg group-[.toaster]:text-[13px]",
          description: "group-[.toast]:text-gray-500 group-[.toast]:text-[12px]",
          actionButton:
            "group-[.toast]:bg-[#1A5632] group-[.toast]:text-white group-[.toast]:text-[12px]",
          cancelButton:
            "group-[.toast]:bg-gray-100 group-[.toast]:text-gray-500 group-[.toast]:text-[12px]",
          error: "group-[.toaster]:border-red-200 group-[.toaster]:text-red-800",
          success: "group-[.toaster]:border-green-200 group-[.toaster]:text-green-800",
        },
      }}
      position="top-right"
      richColors
      {...props}
    />
  );
};

export { Toaster };
