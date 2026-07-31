import { Section, Text } from 'react-email';
import * as React from 'react';
import { content, paragraph, paragraphMuted } from '../css/styles';
import { EmailButton, Greeting, MailBody } from '../partials/partials';

interface Props {
  inviteLink: string;
}

export const InvitationEmail = ({ inviteLink }: Props) => {
  return (
    <MailBody>
      <Section style={content}>
        <Greeting />
        <Text style={paragraph}>
          Você foi convidado para a Gobrax Wiki, a base de conhecimento da
          Gobrax.
        </Text>
      </Section>
      <EmailButton href={inviteLink}>Aceitar convite</EmailButton>
      <Section style={content}>
        <Text style={paragraphMuted}>
          Você recebeu este e-mail porque alguém da equipe te convidou.
        </Text>
      </Section>
    </MailBody>
  );
};

export default InvitationEmail;
