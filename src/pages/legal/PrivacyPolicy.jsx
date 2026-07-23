import React from 'react';
import LegalLayout from './LegalLayout';
import styles from './Legal.module.css';

const LAST_UPDATED = '2026-07-23';

const P = ({ children }) => <p className={styles.p}>{children}</p>;
const UL = ({ items }) => (
  <ul className={styles.ul}>
    {items.map((item, i) => <li key={i}>{item}</li>)}
  </ul>
);

const sections = [
  {
    id: 'introduction',
    title: '1. Introduction',
    body: (
      <>
        <P>
          This Privacy Policy explains how Nelishka AI Solutions ("Nelishka", "we", "us", or "our")
          collects, uses, shares, and protects personal data when you use Swarnix Studio ("Studio",
          the "Services") — our web app for generating AI studio photos, metal swaps, AI model shots,
          jewellery designs, and reels from your product images.
        </P>
        <P>
          This Policy works alongside our <a href="/terms-of-service">Terms of Service</a>. If you do
          not agree with this Policy, do not use the Services.
        </P>
      </>
    ),
  },
  {
    id: 'who-we-are',
    title: '2. Who We Are',
    body: (
      <P>
        Nelishka AI Solutions is a company based in Mumbai, Maharashtra, India. For the purposes of
        the Digital Personal Data Protection Act, 2023 (the "DPDP Act"), Nelishka acts as a{' '}
        <strong>Data Fiduciary</strong> in respect of the personal data it determines the purpose and
        means of processing. You can reach us using the contact details in the Grievance Officer
        section below.
      </P>
    ),
  },
  {
    id: 'information-we-collect',
    title: '3. Information We Collect',
    body: (
      <>
        <P>We collect the following categories of data:</P>
        <UL
          items={[
            <><strong>Account data</strong> — your name, email address, and profile photo, received from Google when you sign in.</>,
            <><strong>Uploaded images</strong> — the jewellery product photos you upload to use with Studio Photo, Metal Swap, AI Model, Jewellery Design, or Reels, and the images generated from them.</>,
            <><strong>Generation inputs</strong> — the prompts, style choices, target metal, and other settings you provide when generating a photo, design, or reel.</>,
            <><strong>Payment-related data</strong> — billing details needed to process credit-pack purchases. Card and bank details are handled by our payment processor; we do not store full card numbers ourselves.</>,
            <><strong>Technical, usage, and log data</strong> — IP address, device and browser information, access times, and features used, collected automatically.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'how-we-use',
    title: '4. How and Why We Use It',
    body: (
      <>
        <P>We process your data for these purposes:</P>
        <UL
          items={[
            'To generate the studio photos, metal swaps, AI model shots, designs, and reels you request;',
            'To create and manage your account and authenticate you via Google sign-in;',
            'To track and enforce your credit balance;',
            'To process credit-pack payments and manage billing;',
            'To provide customer support and respond to requests;',
            'To secure the Services, prevent abuse, and maintain availability;',
            'To maintain, analyse, and improve the Services;',
            'To comply with legal obligations and enforce our Terms of Service.',
          ]}
        />
        <P>
          <strong>Legal basis under the DPDP Act.</strong> We process personal data on the basis of
          consent or for other lawful purposes permitted under the DPDP Act. Where consent is the
          basis, you may withdraw it at any time as described in the Your Rights section.
        </P>
      </>
    ),
  },
  {
    id: 'ai-processing',
    title: '5. AI Processing and Generated Content',
    body: (
      <>
        <P>
          The Services use artificial intelligence to generate images and video from the photos and
          prompts you provide. To do this, your uploaded images and prompts are sent to our AI
          processing pipeline and third-party AI model providers to produce the output.
        </P>
        <P>
          <strong>Use of data for model training.</strong> Your uploaded images and generated outputs
          are not used to train or fine-tune AI models.
        </P>
        <P>
          Generated outputs may be imperfect, and you are responsible for reviewing them before using
          them commercially — see the AI-Specific Terms in our Terms of Service.
        </P>
      </>
    ),
  },
  {
    id: 'sharing',
    title: '6. Sharing and Third-Party Sub-Processors',
    body: (
      <>
        <P>
          We do not sell personal data. We share data only as needed to operate the Services or as
          required by law, with the following categories of recipients:
        </P>
        <UL
          items={[
            <><strong>Authentication provider</strong> — Google, to let you sign in.</>,
            <><strong>AI image and video generation providers</strong> — to produce studio photos, metal swaps, AI model shots, designs, and reels from your uploads and prompts.</>,
            <><strong>Hosting, database, and storage providers</strong> — to run the Services and store your images (Supabase, Cloudinary).</>,
            <><strong>Payment processor</strong> — Razorpay Payment Solutions Pvt. Ltd., to handle credit-pack purchases.</>,
            <><strong>Analytics and diagnostics providers</strong> — to understand usage and improve the Services.</>,
            <><strong>Professional advisers and authorities</strong> — where required by law, regulation, or legal process.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'cross-border',
    title: '7. Cross-Border Transfers',
    body: (
      <P>
        We operate from India and serve customers worldwide. Personal data may be processed or
        stored in India or in other countries where our sub-processors operate, including the AI
        model and hosting providers listed above. Where we transfer personal data outside India, we
        do so in line with the DPDP Act and applicable law.
      </P>
    ),
  },
  {
    id: 'retention',
    title: '8. Data Retention and Deletion',
    body: (
      <>
        <P>
          We keep your uploaded images, generated outputs, and account data for as long as your
          account is active, so you can access your Studio Library, plus a limited period after
          account closure to comply with legal and accounting obligations.
        </P>
        <P>
          You can request deletion of your account and associated data at any time by contacting us
          — see the Your Rights section below.
        </P>
      </>
    ),
  },
  {
    id: 'your-rights',
    title: '9. Your Rights as a Data Principal',
    body: (
      <>
        <P>Subject to the DPDP Act and applicable law, you have the right to:</P>
        <UL
          items={[
            <><strong>Access</strong> a summary of the personal data we process about you.</>,
            <><strong>Correction and updating</strong> of inaccurate or outdated data.</>,
            <><strong>Erasure</strong> of your personal data where it is no longer needed and retention is not required by law.</>,
            <><strong>Grievance redressal</strong> — to raise a complaint with our Grievance Officer.</>,
            <><strong>Nominate</strong> another individual to exercise your rights in the event of your death or incapacity.</>,
          ]}
        />
        <P>
          To exercise any of these rights, contact our Grievance Officer using the details below. We
          may need to verify your identity before acting on a request.
        </P>
      </>
    ),
  },
  {
    id: 'cookies',
    title: '10. Cookies and Session Storage',
    body: (
      <P>
        The Services use browser storage to keep you signed in and remember your session. You can
        control cookies through your browser settings; disabling them may prevent you from staying
        signed in.
      </P>
    ),
  },
  {
    id: 'security',
    title: '11. Data Security',
    body: (
      <P>
        We maintain reasonable technical and organisational measures designed to protect personal
        data against unauthorised access, loss, misuse, or alteration, in line with the DPDP Act and
        the Information Technology Act, 2000. No method of transmission or storage is completely
        secure, and we cannot guarantee absolute security.
      </P>
    ),
  },
  {
    id: 'children',
    title: '12. Children’s Data',
    body: (
      <P>
        The Services are a business tool intended for use by jewellery businesses and adults. They
        are not directed at children. We do not knowingly collect personal data of children.
      </P>
    ),
  },
  {
    id: 'changes',
    title: '13. Changes to This Policy',
    body: (
      <P>
        We may update this Policy from time to time. When we make material changes, we will update
        the "Last updated" date above. Your continued use of the Services after changes take effect
        means you accept the updated Policy.
      </P>
    ),
  },
  {
    id: 'grievance',
    title: '14. Grievance Officer and Contact',
    body: (
      <>
        <P>
          In accordance with the DPDP Act and the Information Technology Act, 2000, you may contact
          our Grievance Officer with any question, request, or complaint about your personal data or
          this Policy.
        </P>
        <UL
          items={[
            <><strong>Grievance Officer:</strong> Vibha Modi</>,
            <><strong>Email:</strong> modivibha99@gmail.com</>,
            <><strong>Address:</strong> 1503/04, Rejoice, Citi of Joy, J.S.D. Road, Mulund West, Mumbai, Maharashtra, India 400080</>,
            <><strong>Response timeline:</strong> We will acknowledge your request within 24–48 hours and aim to respond within 7–10 working days.</>,
          ]}
        />
        <P>
          If you are not satisfied with our response, you may escalate your complaint to the{' '}
          <strong>Data Protection Board of India</strong> as provided under the DPDP Act.
        </P>
      </>
    ),
  },
  {
    id: 'governing-law',
    title: '15. Governing Law',
    body: (
      <P>
        This Policy is governed by the laws of India. Subject to applicable law, the courts at
        Mumbai, Maharashtra, India shall have exclusive jurisdiction over any dispute arising out of
        or relating to this Policy.
      </P>
    ),
  },
];

export default function PrivacyPolicy({ navigate }) {
  return (
    <LegalLayout
      title="Privacy Policy"
      updated={LAST_UPDATED}
      intro={
        <P>
          This Privacy Policy explains how Nelishka AI Solutions collects, uses, shares, and
          protects personal data when you use Swarnix Studio. Read it alongside our{' '}
          <a href="/terms-of-service" onClick={(e) => { e.preventDefault(); navigate('/terms-of-service'); }}>
            Terms of Service
          </a>.
        </P>
      }
      sections={sections}
      navigate={navigate}
    />
  );
}
