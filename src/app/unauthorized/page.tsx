import Image from "next/image";
import Link from "next/link";
import TdLogo from "../../../public/td-logo.png";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-[#F2EBD9] p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-[#7C563D] flex items-center justify-center mb-3">
            <Image src={TdLogo} alt="TD" width={36} height={36} className="object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-[#2C1810]">My Kitchen Book</h1>
        </div>

        <div className="bg-[#FBF8F2] rounded-2xl border border-[#D9CCAF] shadow-sm p-6 text-center">
          <h2 className="text-lg font-semibold text-[#2C1810] mb-2">
            Access Denied
          </h2>
          <p className="text-sm text-[#7C6352] mb-6">
            Your account does not have access to this application. Contact
            your administrator.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center w-full px-4 py-2.5 rounded-lg bg-[#7C563D] text-[#E9DFC6] text-sm font-medium hover:bg-[#6B4832] transition-colors"
          >
            Back to Login
          </Link>
        </div>

        <p className="text-center text-xs text-[#B88D6A] mt-6">
          My Kitchen Book &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
