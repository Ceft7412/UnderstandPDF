"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { signup } from "@/src/services";

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  terms?: string;
}

function validate(
  name: string,
  email: string,
  password: string,
  termsAccepted: boolean
): FieldErrors {
  const errors: FieldErrors = {};

  if (!name.trim()) {
    errors.name = "Full name is required";
  } else if (name.trim().length < 2) {
    errors.name = "Name must be at least 2 characters";
  }

  if (!email) {
    errors.email = "Email is required";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Enter a valid email address";
  }

  if (!password) {
    errors.password = "Password is required";
  } else if (password.length < 8) {
    errors.password = "Password must be at least 8 characters";
  }

  if (!termsAccepted) {
    errors.terms = "You must accept the Terms of Service and Privacy Policy";
  }

  return errors;
}

export function SignupForm({ serverError }: { serverError?: string }) {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [_state, formAction, isPending] = useActionState(
    async (_prev: unknown, formData: FormData) => {
      const name = (formData.get("name") as string) ?? "";
      const email = (formData.get("email") as string) ?? "";
      const password = (formData.get("password") as string) ?? "";
      const errors = validate(name, email, password, termsAccepted);

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        setTouched({ name: true, email: true, password: true, terms: true });
        return { ok: false };
      }

      setFieldErrors({});
      await signup(formData);
      return { ok: true };
    },
    null
  );

  // Live field validation on change (only for touched fields)
  const handleChange = (field: keyof FieldErrors, value: string) => {
    if (!touched[field]) return;

    // Partial validation per field
    const singleErrors: FieldErrors = {};
    if (field === "name") {
      if (!value.trim()) singleErrors.name = "Full name is required";
      else if (value.trim().length < 2)
        singleErrors.name = "Name must be at least 2 characters";
    }
    if (field === "email") {
      if (!value) singleErrors.email = "Email is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
        singleErrors.email = "Enter a valid email address";
    }
    if (field === "password") {
      if (!value) singleErrors.password = "Password is required";
      else if (value.length < 8)
        singleErrors.password = "Password must be at least 8 characters";
    }

    setFieldErrors((prev) => ({ ...prev, [field]: singleErrors[field] }));
  };

  // Clear server error when user starts typing
  const [showServerError, setShowServerError] = useState(!!serverError);
  useEffect(() => {
    setShowServerError(!!serverError);
  }, [serverError]);

  const inputClass = (field: keyof FieldErrors) =>
    `w-full rounded-md border px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 ${
      fieldErrors[field]
        ? "border-red-400 focus:border-red-500 focus:ring-red-500"
        : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
    }`;

  return (
    <>
      {showServerError && serverError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {serverError}
        </div>
      )}

      <form action={formAction} className="space-y-5" noValidate>
        {/* Full name */}
        <div>
          <label
            htmlFor="name"
            className="mb-1 block text-sm font-medium text-gray-900"
          >
            Full name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder="John Doe"
            onChange={(e) => {
              handleChange("name", e.target.value);
              setShowServerError(false);
            }}
            onBlur={(e) => {
              setTouched((t) => ({ ...t, name: true }));
              handleChange("name", e.target.value);
            }}
            aria-invalid={!!fieldErrors.name}
            aria-describedby={fieldErrors.name ? "name-error" : undefined}
            className={inputClass("name")}
          />
          {fieldErrors.name && (
            <p id="name-error" className="mt-1 text-xs text-red-600">
              {fieldErrors.name}
            </p>
          )}
        </div>

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
              handleChange("email", e.target.value);
            }}
            aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
            className={inputClass("email")}
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
            autoComplete="new-password"
            placeholder="Create a password"
            onChange={(e) => {
              handleChange("password", e.target.value);
              setShowServerError(false);
            }}
            onBlur={(e) => {
              setTouched((t) => ({ ...t, password: true }));
              handleChange("password", e.target.value);
            }}
            aria-invalid={!!fieldErrors.password}
            aria-describedby={
              fieldErrors.password ? "password-error" : undefined
            }
            className={inputClass("password")}
          />
          {fieldErrors.password && (
            <p id="password-error" className="mt-1 text-xs text-red-600">
              {fieldErrors.password}
            </p>
          )}
        </div>

        {/* Terms agreement */}
        <div>
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => {
                setTermsAccepted(e.target.checked);
                setTouched((t) => ({ ...t, terms: true }));
                if (e.target.checked) {
                  setFieldErrors((prev) => ({ ...prev, terms: undefined }));
                }
              }}
              className={`mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${
                fieldErrors.terms ? "border-red-400" : ""
              }`}
            />
            <span>
              I agree to the{" "}
              <a
                href="#"
                className="font-medium text-blue-600 underline hover:text-blue-700"
              >
                Terms of Service
              </a>{" "}
              and{" "}
              <a
                href="#"
                className="font-medium text-blue-600 underline hover:text-blue-700"
              >
                Privacy Policy
              </a>
            </span>
          </label>
          {fieldErrors.terms && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.terms}</p>
          )}
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
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </button>
      </form>
    </>
  );
}
