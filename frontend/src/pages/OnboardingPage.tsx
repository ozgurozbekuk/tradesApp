// Renders a top-level frontend page.
import { SignedIn, SignedOut, useAuth, useUser } from "@clerk/clerk-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

type MeResponse = {
  user: {
    email: string | null;
    businessName: string | null;
    phone: string | null;
    businessAddress: string | null;
    businessPhone: string | null;
    businessIban: string | null;
    phoneVerifiedAt: string | null;
    whatsappActivatedAt: string | null;
  } | null;
};

type ActivationResponse = {
  activation: {
    sandboxNumber: string;
    joinCode: string;
    joinText: string;
    waLink: string;
  };
};

type SendCodeResponse = {
  verificationRequired: boolean;
  phoneMasked: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const OnboardingInner = () => {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const { user } = useUser();
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessIban, setBusinessIban] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [phoneMasked, setPhoneMasked] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submittingForm, setSubmittingForm] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [activation, setActivation] = useState<ActivationResponse["activation"] | null>(null);

  const fetchProtected = async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const token = await getToken();
    if (!token) {
      throw new Error("Missing Clerk session token.");
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {})
      }
    });

    const payload = (await response.json()) as T & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error || "Request failed.");
    }

    return payload;
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [mePayload, activationPayload] = await Promise.all([
          fetchProtected<MeResponse>("/api/account/me"),
          fetchProtected<ActivationResponse>("/api/account/activation")
        ]);

        setActivation(activationPayload.activation);

        if (mePayload.user) {
          setEmail(mePayload.user.email || user?.primaryEmailAddress?.emailAddress || "");
          setBusinessName(mePayload.user.businessName || "");
          setPhone(mePayload.user.phone || user?.primaryPhoneNumber?.phoneNumber || "");
          setBusinessAddress(mePayload.user.businessAddress || "");
          setBusinessPhone(mePayload.user.businessPhone || "");
          setBusinessIban(mePayload.user.businessIban || "");
          setPhoneVerified(Boolean(mePayload.user.phoneVerifiedAt));
          setVerificationRequired(!mePayload.user.phoneVerifiedAt && Boolean(mePayload.user.phone));
          if (mePayload.user.phone) {
            setPhoneMasked(
              `${mePayload.user.phone.slice(0, 4)}******${mePayload.user.phone.slice(-2)}`
            );
          }
        } else {
          setEmail(user?.primaryEmailAddress?.emailAddress || "");
          setPhone(user?.primaryPhoneNumber?.phoneNumber || "");
        }
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Could not load onboarding data.";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [getToken, user]);

  const handleProfileSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmittingForm(true);
    setSuccess("");
    setError("");

    try {
      const payload = await fetchProtected<SendCodeResponse>("/api/account/send-phone-code", {
        method: "POST",
        body: JSON.stringify({
          email,
          businessName,
          phone,
          businessAddress,
          businessPhone,
          businessIban
        })
      });

      setVerificationRequired(payload.verificationRequired);
      setPhoneMasked(payload.phoneMasked);
      setPhoneVerified(false);
      setSuccess("We sent a verification code to your phone. Enter it below.");
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Could not save profile.";
      setError(message);
    } finally {
      setSubmittingForm(false);
    }
  };

  const handleResendCode = async () => {
    setSubmittingForm(true);
    setSuccess("");
    setError("");

    try {
      const payload = await fetchProtected<SendCodeResponse>("/api/account/send-phone-code", {
        method: "POST",
        body: JSON.stringify({
          email,
          businessName,
          phone,
          businessAddress,
          businessPhone,
          businessIban
        })
      });

      setVerificationRequired(payload.verificationRequired);
      setPhoneMasked(payload.phoneMasked);
      setSuccess("A new verification code has been sent.");
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Could not resend code.";
      setError(message);
    } finally {
      setSubmittingForm(false);
    }
  };

  const handleVerifyCode = async (event: FormEvent) => {
    event.preventDefault();
    setVerifyingCode(true);
    setSuccess("");
    setError("");

    try {
      await fetchProtected("/api/account/verify-phone-code", {
        method: "POST",
        body: JSON.stringify({ code: verificationCode })
      });
      setPhoneVerified(true);
      setVerificationRequired(false);
      setSuccess("Phone verified. You can now connect WhatsApp.");
      window.setTimeout(() => {
        navigate("/dashboard", { replace: true });
      }, 800);
    } catch (verifyError) {
      const message = verifyError instanceof Error ? verifyError.message : "Could not verify code.";
      setError(message);
    } finally {
      setVerifyingCode(false);
    }
  };

  const progressLabel = useMemo(() => {
    if (phoneVerified) {
      return "Step 3 of 3";
    }
    if (verificationRequired) {
      return "Step 2 of 3";
    }
    return "Step 1 of 3";
  }, [phoneVerified, verificationRequired]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f7fb] px-4">
        <div className="w-full max-w-xl rounded-[32px] border border-slate-200 bg-white p-10 text-center shadow-soft">
          <h1 className="font-display text-4xl font-semibold text-slate-950">Preparing onboarding</h1>
          <p className="mt-4 text-base leading-7 text-slate-600">Loading your profile data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb] px-4 py-10 sm:px-6">
      <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[1.08fr_0.92fr]">
        <section className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-soft sm:p-10">
          <div className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
            {progressLabel}
          </div>
          <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            Set up your business profile
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            First save your business details. Then verify the phone number by SMS. Once verified,
            we show the WhatsApp connection step.
          </p>

          <form onSubmit={handleProfileSubmit} className="mt-8 grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Email address</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white"
                  placeholder="name@business.com"
                  required
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Business name</span>
                <input
                  value={businessName}
                  onChange={(event) => setBusinessName(event.target.value)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white"
                  placeholder="John Doe Plumbing"
                  required
                />
              </label>
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">WhatsApp phone</span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white"
                placeholder="+447..."
                required
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">Business address</span>
              <input
                value={businessAddress}
                onChange={(event) => setBusinessAddress(event.target.value)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white"
                placeholder="Optional"
              />
            </label>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Business phone</span>
                <input
                  value={businessPhone}
                  onChange={(event) => setBusinessPhone(event.target.value)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white"
                  placeholder="Optional"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">IBAN</span>
                <input
                  value={businessIban}
                  onChange={(event) => setBusinessIban(event.target.value)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white"
                  placeholder="Optional"
                />
              </label>
            </div>

            {success ? <p className="text-sm font-medium text-emerald-700">{success}</p> : null}
            {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <button
                type="submit"
                disabled={submittingForm}
                className="inline-flex items-center justify-center rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(37,99,235,0.24)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submittingForm ? "Sending code..." : "Save and send verification code"}
              </button>
              <Link
                to="/"
                className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Back to landing page
              </Link>
            </div>
          </form>

          {verificationRequired ? (
            <form
              onSubmit={handleVerifyCode}
              className="mt-8 rounded-[28px] border border-slate-200 bg-slate-50 p-6"
            >
              <div className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-700">
                Verify phone
              </div>
              <h2 className="mt-3 text-2xl font-semibold text-slate-950">
                Enter the code we sent to {phoneMasked || phone}
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                The code expires in 10 minutes. If you changed the phone number above, submit the
                form again to send a fresh code.
              </p>

              <div className="mt-5 flex flex-col gap-4 sm:flex-row">
                <input
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  maxLength={6}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500"
                  placeholder="6-digit code"
                  required
                />
                <button
                  type="submit"
                  disabled={verifyingCode}
                  className="inline-flex items-center justify-center rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {verifyingCode ? "Verifying..." : "Verify code"}
                </button>
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => void handleResendCode()}
                  disabled={submittingForm}
                  className="text-sm font-semibold text-blue-700 transition hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submittingForm ? "Sending..." : "Resend code"}
                </button>
              </div>
            </form>
          ) : null}
        </section>

        <section className="rounded-[32px] border border-slate-200 bg-slate-950 p-8 text-white shadow-[0_28px_60px_rgba(15,23,42,0.18)] sm:p-10">
          <div className="inline-flex rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
            {phoneVerified ? "WhatsApp activation" : "Phone verification"}
          </div>
          <h2 className="mt-5 font-display text-3xl font-semibold tracking-tight">
            {phoneVerified ? "Connect your number" : "Verify your phone first"}
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-300">
            {phoneVerified
              ? "Now that the number is verified, send the sandbox join code from the same WhatsApp number."
              : "After you submit the form, we send a 6-digit code by SMS. Once that is confirmed, the WhatsApp join step unlocks."}
          </p>

          {phoneVerified ? (
            <>
              <div className="mt-8 space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-6">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Sandbox number</div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {activation?.sandboxNumber || "-"}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Join message</div>
                  <div className="mt-2 rounded-2xl bg-white/10 px-4 py-3 font-mono text-sm text-emerald-300">
                    {activation?.joinText || "join <code>"}
                  </div>
                </div>
                {activation?.waLink ? (
                  <a
                    href={activation.waLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                  >
                    Open WhatsApp and send join code
                  </a>
                ) : (
                  <p className="text-sm text-slate-400">
                    Add `TWILIO_SANDBOX_JOIN_CODE` and `TWILIO_WHATSAPP_FROM` in backend env to
                    show the WhatsApp activation button.
                  </p>
                )}
              </div>

              <div className="mt-8 rounded-[28px] border border-white/10 bg-[#101b38] p-6">
                <div className="text-sm font-semibold text-white">What happens next?</div>
                <div className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
                  <p>1. Open WhatsApp from the verified number.</p>
                  <p>2. Send the sandbox join message.</p>
                  <p>3. The assistant will start using this account data.</p>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-8 rounded-[28px] border border-white/10 bg-[#101b38] p-6">
              <div className="text-sm font-semibold text-white">How this works</div>
              <div className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
                <p>1. Fill in the form with business name, email and phone.</p>
                <p>2. We save the details and send a verification code to that phone number.</p>
                <p>3. After the code is correct, we unlock the WhatsApp connection step.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export const OnboardingPage = () => {
  return (
    <>
      <SignedIn>
        <OnboardingInner />
      </SignedIn>
      <SignedOut>
        <Navigate to="/login" replace />
      </SignedOut>
    </>
  );
};
