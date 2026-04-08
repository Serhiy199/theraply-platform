import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-6 py-16 text-center">
      <div className="soft-card w-full max-w-lg rounded-[24px] p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">404</p>
        <h1 className="mt-4 text-3xl font-semibold text-slate-900">Page not found</h1>
        <p className="mt-4 text-base text-slate-600">
          The page you are looking for is not available in this build yet.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex rounded-full bg-blue-700 px-5 py-3 text-sm font-medium text-white transition hover:bg-blue-800"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
