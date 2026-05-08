const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn();
const mockLoggerWarn = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: (...args: unknown[]) => mockCreateTransport(...args),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
  },
}));

const { sendManagerReviewEmail } = require('./managerReviewEmailSender');

const savedEnv = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...savedEnv };
  process.env.EMAIL_HOST = 'smtp.example.com';
  process.env.EMAIL_PORT = '587';
  process.env.EMAIL_FROM = 'noreply@example.com';
  process.env.APP_TITLE = 'HumLibreChat';
  delete process.env.EMAIL_SERVICE;
  delete process.env.EMAIL_USERNAME;
  delete process.env.EMAIL_PASSWORD;
  delete process.env.EMAIL_ENCRYPTION;
  delete process.env.EMAIL_ENCRYPTION_HOSTNAME;
  delete process.env.EMAIL_ALLOW_SELFSIGNED;
  delete process.env.MAILGUN_API_KEY;
  delete process.env.MAILGUN_DOMAIN;
  delete process.env.MANAGER_REVIEW_EMAIL_MODE;

  mockSendMail.mockResolvedValue({ messageId: 'message-1' });
  mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
});

afterAll(() => {
  process.env = savedEnv;
});

const email = {
  to: 'manager@example.com',
  subject: 'Manager review',
  text: 'Text body',
  html: '<p>Text body</p>',
};

describe('sendManagerReviewEmail', () => {
  it('does not send when manager review email mode is disabled', async () => {
    const result = await sendManagerReviewEmail(email);

    expect(result).toEqual({
      mode: 'disabled',
      sent: false,
      reason: 'MANAGER_REVIEW_EMAIL_MODE is not smtp',
    });
    expect(mockCreateTransport).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('sends through SMTP when mode and email config are enabled', async () => {
    process.env.MANAGER_REVIEW_EMAIL_MODE = 'smtp';

    const result = await sendManagerReviewEmail(email);

    expect(result).toEqual({
      mode: 'smtp',
      sent: true,
    });
    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: '587',
      }),
    );
    expect(mockSendMail).toHaveBeenCalledWith({
      from: '"HumLibreChat" <noreply@example.com>',
      to: 'manager@example.com',
      envelope: {
        from: 'noreply@example.com',
        to: 'manager@example.com',
      },
      subject: 'Manager review',
      text: 'Text body',
      html: '<p>Text body</p>',
    });
  });

  it('does not send when SMTP config is incomplete', async () => {
    process.env.MANAGER_REVIEW_EMAIL_MODE = 'smtp';
    delete process.env.EMAIL_FROM;

    const result = await sendManagerReviewEmail(email);

    expect(result).toEqual({
      mode: 'disabled',
      sent: false,
      reason: 'Email configuration is incomplete',
    });
    expect(mockCreateTransport).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});
