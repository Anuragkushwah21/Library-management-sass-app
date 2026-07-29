import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
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
          <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
          <p className="text-muted-foreground">Last updated: January 2024</p>
        </div>

        <div className="prose prose-invert dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-bold mb-4">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground mb-4">
              By accessing and using LibraSaaS, you accept and agree to be bound by the terms
              and provision of this agreement. If you do not agree to abide by the above, please
              do not use this service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">2. Use License</h2>
            <p className="text-muted-foreground mb-4">
              Permission is granted to temporarily download one copy of the materials (information
              or software) on LibraSaaS for personal, non-commercial transitory viewing only. This
              is the grant of a license, not a transfer of title, and under this license you may not:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>Modifying or copying the materials</li>
              <li>Using the materials for any commercial purpose or for any public display</li>
              <li>Attempting to decompile or reverse engineer any software contained on LibraSaaS</li>
              <li>Removing any copyright or other proprietary notations from the materials</li>
              <li>Transferring the materials to another person or &quot;mirror&quot; the materials on any other server</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">3. Disclaimer</h2>
            <p className="text-muted-foreground">
              The materials on LibraSaaS are provided on an 'as is' basis. LibraSaaS makes no
              warranties, expressed or implied, and hereby disclaims and negates all other warranties
              including, without limitation, implied warranties or conditions of merchantability, fitness
              for a particular purpose, or non-infringement of intellectual property or other violation of rights.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">4. Limitations</h2>
            <p className="text-muted-foreground">
              In no event shall LibraSaaS or its suppliers be liable for any damages (including, without
              limitation, damages for loss of data or profit, or due to business interruption) arising out
              of the use or inability to use the materials on LibraSaaS.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">5. Accuracy of Materials</h2>
            <p className="text-muted-foreground">
              The materials appearing on LibraSaaS could include technical, typographical, or photographic
              errors. LibraSaaS does not warrant that any of the materials on its website are accurate,
              complete, or current. LibraSaaS may make changes to the materials contained on its website
              at any time without notice.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">6. Links</h2>
            <p className="text-muted-foreground">
              LibraSaaS has not reviewed all of the sites linked to its website and is not responsible
              for the contents of any such linked site. The inclusion of any link does not imply endorsement
              by LibraSaaS of the site. Use of any such linked website is at the user's own risk.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">7. Modifications</h2>
            <p className="text-muted-foreground">
              LibraSaaS may revise these terms of service for its website at any time without notice. By
              using this website, you are agreeing to be bound by the then current version of these terms
              of service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">8. Governing Law</h2>
            <p className="text-muted-foreground">
              These terms and conditions are governed by and construed in accordance with the laws of India,
              and you irrevocably submit to the exclusive jurisdiction of the courts located in New Delhi, India.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Contact Us</h2>
            <p className="text-muted-foreground">
              If you have any questions about these Terms of Service, please contact us at{' '}
              <a href="mailto:support@librasaas.com" className="text-primary hover:underline">
                support@librasaas.com
              </a>
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-border/50">
          <p className="text-sm text-muted-foreground mb-4">
            By using LibraSaaS, you acknowledge that you have read, understood, and agree to be bound by
            all the terms and conditions stated in this agreement.
          </p>
        </div>
      </div>
    </div>
  );
}
