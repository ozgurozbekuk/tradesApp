import { Router } from "express";

export const staticRouter = Router();

staticRouter.get("/privacy", (_req, res) => {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Privacy</title>
  </head>
  <body>
    <h1>Privacy Notice</h1>
    <p>We process WhatsApp messages and business records to provide the assistant service.</p>
    <p>Data includes customers, jobs, payments, reminders, and system audit logs.</p>
    <p>Contact support to request data export or deletion.</p>
  </body>
</html>`;

  return res.status(200).type("html").send(html);
});

staticRouter.get("/terms", (_req, res) => {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Terms</title>
  </head>
  <body>
    <h1>Terms of Service</h1>
    <p>The assistant provides operational messaging tools for trades businesses.</p>
    <p>You are responsible for reviewing outputs before acting on them.</p>
    <p>Service availability and features may change over time.</p>
  </body>
</html>`;

  return res.status(200).type("html").send(html);
});
