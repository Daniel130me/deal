import {
  Instagram,
  Linkedin,
  Mail,
  MessageCircle,
  MessageSquareText,
  Music2,
  Phone,
  Send,
  Twitter,
  type LucideIcon,
} from "lucide-react";
import type { ChannelType, CreatorChannel } from "@/lib/types";

export const CHANNEL_META: Record<
  ChannelType,
  {
    label: string;
    icon: LucideIcon;
    placeholder: string;
    hint: string;
    href: (value: string) => string;
  }
> = {
  whatsapp: {
    label: "WhatsApp",
    icon: MessageCircle,
    placeholder: "+234 801 234 5678",
    hint: "Phone number with country code",
    href: (v) => `https://wa.me/${v.replace(/\D/g, "")}`,
  },
  telegram: {
    label: "Telegram",
    icon: Send,
    placeholder: "@username",
    hint: "Your Telegram username",
    href: (v) => `https://t.me/${v.replace(/^@/, "").replace(/\s/g, "")}`,
  },
  instagram: {
    label: "Instagram DM",
    icon: Instagram,
    placeholder: "@yourhandle",
    hint: "Opens a DM with you on Instagram",
    href: (v) => `https://ig.me/m/${v.replace(/^@/, "").replace(/\s/g, "")}`,
  },
  email: {
    label: "Email",
    icon: Mail,
    placeholder: "you@mail.com",
    hint: "Business email address",
    href: (v) => `mailto:${v.trim()}`,
  },
  phone_call: {
    label: "Phone call",
    icon: Phone,
    placeholder: "+234 801 234 5678",
    hint: "Clients call you directly",
    href: (v) => `tel:${v.replace(/\s/g, "")}`,
  },
  sms: {
    label: "SMS",
    icon: MessageSquareText,
    placeholder: "+234 801 234 5678",
    hint: "Text message to your number",
    href: (v) => `sms:${v.replace(/\s/g, "")}`,
  },
  x_twitter: {
    label: "X (Twitter) DM",
    icon: Twitter,
    placeholder: "@yourhandle",
    hint: "Opens a DM with you on X",
    href: (v) => `https://x.com/${v.replace(/^@/, "").replace(/\s/g, "")}`,
  },
  linkedin: {
    label: "LinkedIn",
    icon: Linkedin,
    placeholder: "linkedin.com/in/you",
    hint: "Your LinkedIn profile",
    href: (v) => {
      const clean = v.trim().replace(/^https?:\/\//, "");
      return `https://${clean}`;
    },
  },
  tiktok: {
    label: "TikTok",
    icon: Music2,
    placeholder: "@yourhandle",
    hint: "Your TikTok profile",
    href: (v) => `https://www.tiktok.com/@${v.replace(/^@/, "").replace(/\s/g, "")}`,
  },
};

export const CHANNEL_TYPES = Object.keys(CHANNEL_META) as ChannelType[];

export function primaryChannel(channels: CreatorChannel[] | undefined): CreatorChannel | null {
  if (!channels || channels.length === 0) return null;
  return channels.find((c) => c.primary) ?? channels[0];
}

export function channelHref(channel: CreatorChannel) {
  return CHANNEL_META[channel.type]?.href(channel.value) ?? "#";
}
