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
    id: 'acceptance',
    title: '1. Acceptance of Terms',
    body: (
      <>
        <P>
          By creating an account, accessing, or using Swarnix Studio ("Studio", the "Services"), you
          confirm that you have read, understood, and agree to be bound by these Terms and by our{' '}
          <a href="/privacy-policy">Privacy Policy</a>, which is incorporated into these Terms by
          reference. If you accept these Terms on behalf of a business, you confirm you have the
          authority to bind that business, and "you" refers to that business.
        </P>
        <P>If you do not agree to these Terms, you may not access or use the Services.</P>
      </>
    ),
  },
  {
    id: 'services',
    title: '2. Description of Services',
    body: (
      <>
        <P>
          Swarnix Studio is an AI content-generation tool for jewellery businesses, operated by
          Nelishka AI Solutions ("Nelishka", "we", "us"), a company based in Mumbai, Maharashtra,
          India. It lets you upload jewellery product photos and generate:
        </P>
        <UL
          items={[
            <><strong>Studio Photo</strong> — a clean, studio-lit version of a plain product photo.</>,
            <><strong>Metal Swap</strong> — a recoloured version of a piece in yellow, white, or rose gold.</>,
            <><strong>AI Model</strong> — a photorealistic model shot wearing your jewellery.</>,
            <><strong>Jewellery Design</strong> — a photorealistic render generated from a text prompt or reference image.</>,
            <><strong>Reels</strong> — a short video generated from your photos.</>,
            <><strong>Studio Library</strong> — storage of the photos and videos you generate.</>,
          ]}
        />
        <P>
          Each generation consumes credits from your account balance. We may add, change, or remove
          features over time.
        </P>
      </>
    ),
  },
  {
    id: 'eligibility',
    title: '3. Eligibility and Account Registration',
    body: (
      <>
        <P>
          To use the Services, you must be at least 18 years of age and capable of forming a binding
          contract under applicable law. You register and sign in using Google authentication. You
          are responsible for all activity that occurs under your account.
        </P>
        <P>
          We may refuse registration, or suspend or close an account, where we reasonably believe
          these Terms have been breached or where required by law.
        </P>
      </>
    ),
  },
  {
    id: 'credits',
    title: '4. Credits and Payment',
    body: (
      <>
        <P>
          New accounts receive a number of free credits to try the Services. Each generation (Studio
          Photo, Metal Swap, AI Model, Jewellery Design, or Reel) deducts credits from your balance
          at the rate shown in the app. Once your free and purchased credits are used, you must buy
          more credits to continue generating content.
        </P>
        <P>
          Credit packs are purchased through Razorpay. Fees are stated exclusive of applicable taxes
          and GST unless stated otherwise. <strong>Credits are non-refundable once used</strong> to
          generate content. Unused purchased credits do not expire unless stated otherwise at the
          time of purchase.
        </P>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: '5. Acceptable Use and Prohibited Conduct',
    body: (
      <>
        <P>You agree to use the Services only for lawful purposes. You must not:</P>
        <UL
          items={[
            'Upload images you do not own or are not licensed to use;',
            'Upload or generate content that is unlawful, infringing, defamatory, obscene, or fraudulent;',
            'Use generated outputs to misrepresent the nature, origin, or quality of a product in a way that is deceptive or unlawful;',
            'Attempt to gain unauthorised access to the Services, other accounts, or our systems;',
            'Interfere with or disrupt the integrity or performance of the Services;',
            'Reverse engineer, decompile, or attempt to extract the source code of the Services, except to the extent this restriction is prohibited by law;',
            'Use the Services to build a competing product, or resell or sublicense the Services without our written permission.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'ai-terms',
    title: '6. AI-Specific Terms',
    body: (
      <>
        <P>The Services use artificial intelligence to generate images and video. You acknowledge that:</P>
        <UL
          items={[
            <><strong>Outputs may be inaccurate or imperfect.</strong> We do not guarantee that any generated photo, design, or reel is accurate, complete, or suitable for any particular purpose. Details like gemstone colour, metal finish, or proportions may not exactly match the source image.</>,
            <><strong>You remain responsible for reviewing outputs</strong> before publishing or using them commercially, including for accuracy about product appearance, metal type, and pricing claims.</>,
            <><strong>You are responsible for your uploaded images.</strong> You confirm you own or are licensed to use every image you upload, and that it does not infringe the rights of any third party.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'ownership',
    title: '7. Ownership of Uploads and Generated Content',
    body: (
      <>
        <P>
          As between you and Nelishka, you own the images you upload and the content generated from
          them through your use of the Services. We do not claim ownership of your uploads or your
          generated outputs.
        </P>
        <P>
          You grant Nelishka a non-exclusive, worldwide, royalty-free licence to host, store,
          process, and transmit your uploaded images and generated outputs solely as needed to
          operate, maintain, and improve the Services for you (including your Studio Library). This
          licence ends when the relevant content is deleted from the Services, except for copies
          retained as required by law or kept in routine backups for a limited period.
        </P>
      </>
    ),
  },
  {
    id: 'third-party',
    title: '8. Third-Party Services',
    body: (
      <P>
        The Services depend on third-party providers, including Google (authentication), AI image
        and video generation providers, Razorpay (payments), and hosting and storage providers. Your
        use of the Services is subject to the availability of these providers. We are not responsible
        for outages, restrictions, or changes made by third parties, though we will work to keep the
        Services running.
      </P>
    ),
  },
  {
    id: 'intellectual-property',
    title: '9. Intellectual Property',
    body: (
      <P>
        The Services, including all software, design, and the Swarnix name and branding, are owned
        by Nelishka or its licensors. Except for the limited rights granted to you in these Terms
        (and your ownership of your own uploads and outputs, as above), nothing here transfers any
        intellectual property right to you. You may not use our names, logos, or trademarks without
        our prior written consent.
      </P>
    ),
  },
  {
    id: 'warranties',
    title: '10. Warranties and Disclaimers',
    body: (
      <P>
        The Services are provided "as is" and "as available", without warranties of any kind, to the
        maximum extent permitted by law. We do not warrant that the Services will be uninterrupted,
        error-free, or that any generated output will be accurate or meet your requirements.
      </P>
    ),
  },
  {
    id: 'liability',
    title: '11. Limitation of Liability',
    body: (
      <>
        <P>To the maximum extent permitted by applicable law:</P>
        <UL
          items={[
            'Nelishka will not be liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of profits, revenue, goodwill, or data, arising out of or relating to the Services or these Terms.',
            'Nelishka’s total aggregate liability arising out of or relating to the Services will not exceed the total amount you paid to Nelishka for credits in the three (3) months immediately preceding the event giving rise to the claim, or ₹1,000 where no fees have been paid.',
          ]}
        />
        <P>
          Nothing in these Terms excludes or limits liability that cannot be excluded or limited
          under applicable Indian law.
        </P>
      </>
    ),
  },
  {
    id: 'indemnification',
    title: '12. Indemnification',
    body: (
      <P>
        You agree to indemnify and hold harmless Nelishka and its directors, officers, employees,
        and agents from any claims, liabilities, damages, or losses arising out of: (a) images you
        upload or content you generate; (b) your use of the Services in breach of these Terms or
        applicable law; or (c) your infringement of the rights of any third party.
      </P>
    ),
  },
  {
    id: 'termination',
    title: '13. Term, Suspension, and Termination',
    body: (
      <>
        <P>
          We may suspend or terminate your access to the Services if you breach these Terms, if
          required by law, or if continued provision poses a security or legal risk. You may stop
          using the Services and close your account at any time.
        </P>
        <P>
          On termination, unused credits are forfeited unless applicable law requires otherwise.
          Sections that by their nature should survive termination — including intellectual property,
          disclaimers, limitation of liability, and indemnification — will survive.
        </P>
      </>
    ),
  },
  {
    id: 'modifications',
    title: '14. Modifications to the Services and to These Terms',
    body: (
      <P>
        We may modify the Services from time to time, including adding or removing features. We may
        also update these Terms; when we make material changes, we will update the "Last updated"
        date above. Your continued use of the Services after changes take effect means you accept
        the updated Terms.
      </P>
    ),
  },
  {
    id: 'privacy',
    title: '15. Privacy',
    body: (
      <P>
        Our collection and use of personal data is governed by our{' '}
        <a href="/privacy-policy">Privacy Policy</a>, which is incorporated into these Terms by
        reference.
      </P>
    ),
  },
  {
    id: 'governing-law',
    title: '16. Governing Law and Dispute Resolution',
    body: (
      <P>
        These Terms are governed by the laws of India. Subject to applicable law, the courts at
        Mumbai, Maharashtra, India shall have exclusive jurisdiction over any dispute arising out of
        or relating to these Terms or the Services.
      </P>
    ),
  },
  {
    id: 'grievance',
    title: '17. Grievance Officer and Contact',
    body: (
      <>
        <P>
          In accordance with the Information Technology Act, 2000, the details of our Grievance
          Officer are below.
        </P>
        <UL
          items={[
            <><strong>Grievance Officer:</strong> Vibha Modi</>,
            <><strong>Email:</strong> modivibha99@gmail.com</>,
            <><strong>Address:</strong> 1503/04, Rejoice, Citi of Joy, J.S.D. Road, Mulund West, Mumbai, Maharashtra, India 400080</>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'miscellaneous',
    title: '18. Miscellaneous',
    body: (
      <UL
        items={[
          <><strong>Severability.</strong> If any provision of these Terms is held invalid, the remaining provisions continue in full force.</>,
          <><strong>Entire agreement.</strong> These Terms, together with the Privacy Policy, are the entire agreement between you and Nelishka regarding the Services.</>,
          <><strong>Assignment.</strong> You may not assign these Terms without our prior written consent. We may assign these Terms in connection with a merger, acquisition, or sale of assets.</>,
          <><strong>Notices.</strong> We may give notices through the Services or by email to the address linked to your account.</>,
        ]}
      />
    ),
  },
];

export default function TermsOfService({ navigate }) {
  return (
    <LegalLayout
      title="Terms of Service"
      updated={LAST_UPDATED}
      intro={
        <>
          <P>
            These Terms of Service ("Terms") govern your access to and use of Swarnix Studio,
            provided by Nelishka AI Solutions ("Nelishka", "we", "us", or "our"), a company based in
            Mumbai, Maharashtra, India. By accessing or using the Services, you agree to these Terms.
          </P>
          <P>
            Read alongside our{' '}
            <a href="/privacy-policy" onClick={(e) => { e.preventDefault(); navigate('/privacy-policy'); }}>
              Privacy Policy
            </a>.
          </P>
        </>
      }
      sections={sections}
      navigate={navigate}
    />
  );
}
