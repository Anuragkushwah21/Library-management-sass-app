import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-primary hover:underline mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-muted-foreground">Last updated: January 2024</p>
        </div>

        <div className="space-y-8">
          <section>
            <h2 className="text-2xl font-bold mb-4">1. Introduction</h2>
            <p className="text-muted-foreground">
              LibraSaaS (&quot;we&quot; or &quot;us&quot; or &quot;our&quot;) operates the https://librasaas.com website
              (hereinafter referred to as the &quot;Service&quot;). This page informs you of our policies regarding the
              collection, use, and disclosure of personal data when you use our Service and the choices you have
              associated with that data.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">2. Information Collection and Use</h2>
            <p className="text-muted-foreground mb-4">
              We collect several different types of information for various purposes to provide and improve our Service to you.
            </p>
            <h3 className="text-lg font-semibold mb-2">Types of Data Collected:</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>Personal Data: When you create an account, we may collect your name, email address, phone number, and address</li>
              <li>Usage Data: We may collect information about how you access and use the Service (pages visited, time and date of visit)</li>
              <li>Library Data: Information about books, members, transactions, and other library-related data you input</li>
              <li>Technical Data: Browser type, IP address, operating system, referral source, pages visited</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">3. Use of Data</h2>
            <p className="text-muted-foreground mb-4">
              LibraSaaS uses the collected data for various purposes:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>To provide and maintain our Service</li>
              <li>To notify you about changes to our Service</li>
              <li>To allow you to participate in interactive features of our Service</li>
              <li>To provide customer support</li>
              <li>To gather analysis or valuable information to improve our Service</li>
              <li>To monitor the usage of our Service</li>
              <li>To detect, prevent and address technical and security issues</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">4. Security of Data</h2>
            <p className="text-muted-foreground">
              The security of your data is important to us but remember that no method of transmission over the Internet
              or method of electronic storage is 100% secure. While we strive to use commercially acceptable means to protect
              your Personal Data, we cannot guarantee its absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">5. Changes to This Privacy Policy</h2>
            <p className="text-muted-foreground">
              We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy
              Policy on this page and updating the &quot;Last updated&quot; date at the top of this Privacy Policy. We advise you
              to review this Privacy Policy periodically for any changes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">6. Contact Us</h2>
            <p className="text-muted-foreground">
              If you have any questions about this Privacy Policy, please contact us at{' '}
              <a href="mailto:privacy@librasaas.com" className="text-primary hover:underline">
                privacy@librasaas.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">7. User Rights</h2>
            <p className="text-muted-foreground mb-4">
              You have the right to:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Object to processing of your data</li>
              <li>Request restriction of processing</li>
              <li>Data portability</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">8. Data Retention</h2>
            <p className="text-muted-foreground">
              LibraSaaS will retain your Personal Data only for as long as necessary to provide you our Service. We will
              retain and use your Personal Data to the extent necessary to comply with our legal obligations.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-border/50">
          <p className="text-sm text-muted-foreground">
            By using LibraSaaS, you consent to our Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
