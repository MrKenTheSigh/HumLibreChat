import { TStartupConfig } from 'librechat-data-provider';

function Footer({ startupConfig }: { startupConfig: TStartupConfig | null | undefined }) {
  if (!startupConfig) {
    return null;
  }
  return null;
}

export default Footer;
