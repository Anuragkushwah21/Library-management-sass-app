'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Download, Loader2, Printer, QrCode, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { api } from '@/lib/api';

interface QrData {
  url: string;
  png: string;
  qrVersion: number;
  libraryName: string;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export default function LibraryQrPage() {
  const [qr, setQr] = useState<QrData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [rotating, setRotating] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const { data } = await api.getLibraryQr();
      setQr(data);
    } catch (err: any) {
      setError(err.message || 'Could not load the QR code.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const copy = async () => {
    if (!qr) return;
    try {
      await navigator.clipboard.writeText(qr.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — select the link and copy it manually.');
    }
  };

  // A clean A4 poster in its own window, so the dashboard chrome isn't printed
  const print = () => {
    if (!qr) return;
    const w = window.open('', '_blank', 'width=800,height=1000');
    if (!w) {
      toast.error('Allow pop-ups to print the poster.');
      return;
    }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(qr.libraryName)} — Check-in QR</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: system-ui, -apple-system, sans-serif; text-align: center; color: #111; margin: 0; }
  h1 { font-size: 34px; margin: 24px 0 6px; }
  p.lead { font-size: 20px; margin: 0 0 28px; color: #444; }
  img { width: 120mm; height: 120mm; }
  ol { text-align: left; display: inline-block; font-size: 17px; line-height: 1.8; margin-top: 24px; }
  .url { font-size: 11px; color: #888; margin-top: 18px; word-break: break-all; }
</style></head><body>
  <h1>${escapeHtml(qr.libraryName)}</h1>
  <p class="lead">Scan to check in &amp; check out</p>
  <img src="${qr.png}" alt="Check-in QR code" />
  <ol>
    <li>Open your phone camera and scan this code</li>
    <li>Verify your mobile number with the OTP (first time only)</li>
    <li>Scan when you arrive, and again when you leave</li>
  </ol>
  <div class="url">${escapeHtml(qr.url)}</div>
  <script>window.onload = () => { window.focus(); window.print(); };</script>
</body></html>`);
    w.document.close();
  };

  const rotate = async () => {
    setRotating(true);
    try {
      await api.rotateLibraryQr();
      await load();
      toast.success('New QR code generated. Print it and replace the old one.');
    } catch (err: any) {
      toast.error(err.message || 'Could not regenerate the QR code.');
    } finally {
      setRotating(false);
      setConfirmRotate(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Library QR</h1>
        <p className="text-muted-foreground">
          Put this at the entrance. Students scan it to check in when they arrive and check out when they leave.
        </p>
      </div>

      {error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" onClick={load}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : !qr ? (
        <Card>
          <CardContent className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <Card>
            <CardContent className="flex flex-col items-center gap-4 p-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qr.png}
                alt={`Check-in QR code for ${qr.libraryName}`}
                className="aspect-square w-full max-w-[18rem] rounded-lg border bg-white p-2"
              />
              <p className="text-center text-sm font-medium">{qr.libraryName}</p>
              <div className="grid w-full gap-2">
                <Button asChild>
                  <a href={qr.png} download={`checkin-qr-${qr.qrVersion}.png`}>
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </a>
                </Button>
                <Button variant="outline" onClick={print}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print poster
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <QrCode className="h-4 w-4" />
                  Check-in link
                </CardTitle>
                <CardDescription>The same link as the QR — handy to share or test from your phone.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/50 px-3 py-2 text-xs">{qr.url}</code>
                  <Button variant="outline" size="icon" onClick={copy} aria-label="Copy link">
                    {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">How it works</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                  <li>The QR identifies your library, not the student.</li>
                  <li>Students verify their mobile number with an OTP once per phone.</li>
                  <li>First scan of a shift checks them in, the next scan checks them out.</li>
                  <li>Anyone still inside 30 minutes after their shift ends is checked out automatically.</li>
                </ol>
              </CardContent>
            </Card>

            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="text-base">Regenerate QR</CardTitle>
                <CardDescription>
                  If the QR has been shared outside the library, make a new one. Every printed copy of the old QR stops
                  working immediately.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="text-destructive" onClick={() => setConfirmRotate(true)}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Regenerate QR code
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <AlertDialog open={confirmRotate} onOpenChange={setConfirmRotate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate the QR code?</AlertDialogTitle>
            <AlertDialogDescription>
              The current QR stops working right away. Students already verified on their phones stay verified, but
              they&apos;ll need to scan the new QR.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rotating}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={rotate} disabled={rotating}>
              {rotating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
