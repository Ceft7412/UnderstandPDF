"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { login } from "@/src/services";

interface FieldErrors {
  email?: string;
  password?: string;
}

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};

  if (!email) {
    errors.email = "Email is required";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Enter a valid email address";
  }

  if (!password) {
    errors.password = "Password is required";
  } else if (password.length < 6) {
    errors.password = "Password must be at least 6 characters";
  }

  return errors;
}

export function LoginForm({ serverError }: { serverError?: string }) {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // useActionState for pending state on the server action
  const [_state, formAction, isPending] = useActionState(
    async (_prev: unknown, formData: FormData) => {
      // Client-side validation before hitting the server
      const email = (formData.get("email") as string) ?? "";
      const password = (formData.get("password") as string) ?? "";
      const errors = validate(email, password);

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        setTouched({ email: true, password: true });
        return { ok: false };
      }

      setFieldErrors({});
      // Call the actual server action
      await login(formData);
      return { ok: true };
    },
    null
  );

  // Clear field error as user types
  const handleChange = (field: keyof FieldErrors, value: string) => {
    if (!touched[field]) return;
    const testErrors = validate(
      field === "email" ? value : "",
      field === "password" ? value : ""
    );
    setFieldErrors((prev) => ({
      ...prev,
      [field]: testErrors[field],
    }));
  };

  // Clear server error when user starts typing
  const [showServerError, setShowServerError] = useState(!!serverError);
  useEffect(() => {
    setShowServerError(!!serverError);
  }, [serverError]);

  return (
    <>
      {/* Server error */}
      {showServerError && serverError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {serverError}
        </div>
      )}

      <form action={formAction} className="space-y-5" noValidate>
        {/* Email */}
        <div>
          <label
            htmlFor="email"
            className="mb-1 block text-sm font-medium text-gray-900"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            onChange={(e) => {
              handleChange("email", e.target.value);
              setShowServerError(false);
            }}
            onBlur={(e) => {
              setTouched((t) => ({ ...t, email: true }));
              const errors = validate(e.target.value, "");
              setFieldErrors((prev) => ({ ...prev, email: errors.email }));
            }}
            aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
            className={`w-full rounded-md border px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 ${
              fieldErrors.email
                ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            }`}
          />
          {fieldErrors.email && (
            <p id="email-error" className="mt-1 text-xs text-red-600">
              {fieldErrors.email}
            </p>
          )}
        </div>

        {/* Password */}
        <div>
          <label
            htmlFor="password"
            className="mb-1 block text-sm font-medium text-gray-900"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            onChange={(e) => {
              handleChange("password", e.target.value);
              setShowServerError(false);
            }}
            onBlur={(e) => {
              setTouched((t) => ({ ...t, password: true }));
              const errors = validate("", e.target.value);
              setFieldErrors((prev) => ({
                ...prev,
                password: errors.password,
              }));
            }}
            aria-invalid={!!fieldErrors.password}
            aria-describedby={
              fieldErrors.password ? "password-error" : undefined
            }
            className={`w-full rounded-md border px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 ${
              fieldErrors.password
                ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            }`}
          />
          {fieldErrors.password && (
            <p id="password-error" className="mt-1 text-xs text-red-600">
              {fieldErrors.password}
            </p>
          )}
        </div>

        {/* Remember me + Forgot password */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Remember me
          </label>
          <a
            href="#"
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Forgot your password?
          </a>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isPending}
          className="flex w-full items-center justify-center rounded-full bg-amber-400 px-6 py-3 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-60"
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Logging in...
            </>
          ) : (
            "Log in"
          )}
        </button>
      </form>
    </>
  );
}
