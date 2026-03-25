function sendEmails() {
  const addr = "jeffpalm+gmailresize@gmail.com";
  const N = 100;
  for (let i = 0; i < N; i++) {
    const subject = "Email #" + i;
    const body = subject;
    Logger.log("Sending: " + subject);
    GmailApp.sendEmail(addr, subject, body);
  }
}
