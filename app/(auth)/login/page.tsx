import Image from "next/image";
import Link from "next/link";
import logo from "@/src/assets/images/logo.png";
import { signInWithGoogle } from "@/src/services";
import { LoginForm } from "@/src/features/auth/components";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="flex min-h-screen">
      {/* Left Column — Form */}
      <div className="flex flex-1 flex-col justify-center px-8 py-12 sm:px-16 lg:px-24">
        <div className="mx-auto w-full max-w-md">
          {/* Logo */}
          <Link href="/" className="mb-10 flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full ">
              <Image
                src={logo}
                alt="Logo of UnderstandPDF"
                className="object-contain"
                width={32}
                height={32}
                priority
              />
            </span>
            <span className="text-xl font-semibold">UnderstandPDF</span>
          </Link>

          <h1 className="mb-8 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Welcome back to
            <br />
            UnderstandPDF!
          </h1>

          {/* Google Sign In */}
          <form action={signInWithGoogle}>
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-full bg-transparent border-1 border-gray-300 px-6 py-3 text-sm font-medium text-black hover:bg-gray-100"
            >
              <svg
                viewBox="0 0 48 48"
                width="24"
                height="24"
                version="1.1"
                xmlns="http://www.w3.org/2000/svg"
                fill="#000000"
              >
                <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
                <g
                  id="SVGRepo_tracerCarrier"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                ></g>
                <g id="SVGRepo_iconCarrier">
                  <title>Google-color</title> <desc>Created with Sketch.</desc>{" "}
                  <defs> </defs>
                  <g
                    id="Icons"
                    stroke="none"
                    strokeWidth="1"
                    fill="none"
                    fillRule="evenodd"
                  >
                    <g id="Color-" transform="translate(0, 0)">
                      <g id="Google">
                        <path
                          d="M9.82727273,24 C9.82727273,22.4757333 10.0804318,21.0144 10.5322727,19.6437333 L2.62345455,13.6042667 C1.08206818,16.7338667 0.213636364,20.2602667 0.213636364,24 C0.213636364,27.7365333 1.081,31.2608 2.62025,34.3882667 L10.5247955,28.3370667 C10.0772273,26.9728 9.82727273,25.5168 9.82727273,24"
                          id="Fill-1"
                          fill="#FBBC05"
                        ></path>
                        <path
                          d="M23.7136364,10.1333333 C27.025,10.1333333 30.0159091,11.3066667 32.3659091,13.2266667 L39.2022727,6.4 C35.0363636,2.77333333 29.6954545,0.533333333 23.7136364,0.533333333 C14.4268636,0.533333333 6.44540909,5.84426667 2.62345455,13.6042667 L10.5322727,19.6437333 C12.3545909,14.112 17.5491591,10.1333333 23.7136364,10.1333333"
                          id="Fill-2"
                          fill="#EB4335"
                        ></path>
                        <path
                          d="M23.7136364,37.8666667 C17.5491591,37.8666667 12.3545909,33.888 10.5322727,28.3562667 L2.62345455,34.3946667 C6.44540909,42.1557333 14.4268636,47.4666667 23.7136364,47.4666667 C29.4455,47.4666667 34.9177955,45.4314667 39.0249545,41.6181333 L31.5177727,35.8144 C29.3995682,37.1488 26.7323182,37.8666667 23.7136364,37.8666667"
                          id="Fill-3"
                          fill="#34A853"
                        ></path>
                        <path
                          d="M46.1454545,24 C46.1454545,22.6133333 45.9318182,21.12 45.6113636,19.7333333 L23.7136364,19.7333333 L23.7136364,28.8 L36.3181818,28.8 C35.6879545,31.8912 33.9724545,34.2677333 31.5177727,35.8144 L39.0249545,41.6181333 C43.3393409,37.6138667 46.1454545,31.6490667 46.1454545,24"
                          id="Fill-4"
                          fill="#4285F4"
                        ></path>
                      </g>
                    </g>
                  </g>
                </g>
                2
              </svg>
              Login with Google
            </button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-4">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-sm text-gray-500">or</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          {/* Email / Password form with client-side validation */}
          <LoginForm serverError={error} />
        </div>
      </div>

      {/* Right Column — Value Proposition */}
      <div className="hidden flex-1 items-center border-l border-gray-200 bg-gray-50 px-16 lg:flex">
        <div className="max-w-lg">
          <h2 className="mb-4 text-2xl font-semibold leading-snug text-gray-900 sm:text-3xl">
            Turn any PDF into key insights and new research directions.
          </h2>
          <p className="mb-6 text-base leading-relaxed text-gray-600">
            Upload your documents and let AI extract the important findings,
            surface source citations, and suggest where to explore next —
            perfect for research papers, reports, and technical documents.
          </p>
          <p className="text-sm text-gray-600">
            Don&apos;t have an account yet?{" "}
            <Link
              href="/signup"
              className="font-medium text-blue-600 underline hover:text-blue-700"
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>

      {/* Mobile-only sign up link */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white p-4 text-center text-sm text-gray-600 lg:hidden">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="font-medium text-blue-600 underline hover:text-blue-700"
        >
          Sign up
        </Link>
      </div>
    </div>
  );
}
