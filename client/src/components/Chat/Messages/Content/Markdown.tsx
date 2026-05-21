import React, { memo, useMemo } from 'react';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import supersub from 'remark-supersub';
import rehypeKatex from 'rehype-katex';
import { useRecoilValue } from 'recoil';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkDirective from 'remark-directive';
import type { Pluggable } from 'unified';
import { Citation, CompositeCitation, HighlightedText } from '~/components/Web/Citation';
import {
  mcpUIResourcePlugin,
  MCPUIResource,
  MCPUIResourceCarousel,
} from '~/components/MCPUIResource';
import { Artifact, artifactPlugin } from '~/components/Artifacts/Artifact';
import { ArtifactProvider, CodeBlockProvider } from '~/Providers';
import MarkdownErrorBoundary from './MarkdownErrorBoundary';
import { langSubset, preprocessLaTeX } from '~/utils';
import { unicodeCitation } from '~/components/Web';
import { code, a, p, img } from './MarkdownComponents';
import store from '~/store';

type TContentProps = {
  content: string;
  isLatestMessage: boolean;
};

type ArtifactDirectiveMetadata = {
  type: string;
  title: string;
  fenceLanguage: string;
  identifier: string;
};

function getArtifactDirectiveMetadata(language = ''): ArtifactDirectiveMetadata {
  const normalizedLanguage = language.trim().toLowerCase();
  if (
    normalizedLanguage === 'mermaid' ||
    normalizedLanguage === 'application/vnd.mermaid' ||
    normalizedLanguage === 'vnd.mermaid'
  ) {
    return {
      type: 'application/vnd.mermaid',
      title: 'Mermaid Diagram',
      fenceLanguage: 'mermaid',
      identifier: 'mermaid-diagram',
    };
  }

  if (normalizedLanguage === 'application/vnd.code-html' || normalizedLanguage === 'code-html') {
    return {
      type: 'application/vnd.code-html',
      title: 'HTML Document',
      fenceLanguage: 'html',
      identifier: 'html-document',
    };
  }

  if (normalizedLanguage === 'html' || normalizedLanguage === 'text/html') {
    return {
      type: 'text/html',
      title: 'HTML Document',
      fenceLanguage: 'html',
      identifier: 'html-document',
    };
  }

  if (
    ['ant.react', 'antd.react', 'application/vnd.ant.react', 'vnd.ant.react'].includes(
      normalizedLanguage,
    )
  ) {
    return {
      type: 'application/vnd.ant.react',
      title: 'React Component',
      fenceLanguage: 'tsx',
      identifier: 'react-component',
    };
  }

  if (['tsx', 'jsx', 'react', 'application/vnd.react', 'vnd.react'].includes(normalizedLanguage)) {
    return {
      type: 'application/vnd.react',
      title: 'React Component',
      fenceLanguage: 'tsx',
      identifier: 'react-component',
    };
  }

  if (['markdown', 'md', 'text/markdown', 'text/md'].includes(normalizedLanguage)) {
    return {
      type: 'text/markdown',
      title: 'Markdown Document',
      fenceLanguage: 'markdown',
      identifier: 'markdown-document',
    };
  }

  return {
    type: 'text/plain',
    title: 'Text Document',
    fenceLanguage: 'text',
    identifier: 'text-document',
  };
}

function sanitizeArtifactIdentifier(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'artifact'
  );
}

function escapeArtifactAttribute(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function normalizeArtifactDirective(
  body: string,
  metadataOverrides: Partial<ArtifactDirectiveMetadata> = {},
): string {
  const fencedContent = body.match(/^```([A-Za-z0-9_-]*)\r?\n([\s\S]*?)\r?\n```\s*$/m);
  const metadata = {
    ...getArtifactDirectiveMetadata(fencedContent?.[1] || metadataOverrides.type || ''),
    ...metadataOverrides,
  };
  const artifactContent = fencedContent?.[2] ?? body;
  const identifier = escapeArtifactAttribute(sanitizeArtifactIdentifier(metadata.identifier));
  const title = escapeArtifactAttribute(metadata.title);

  return [
    `:::artifact{identifier="${identifier}" type="${metadata.type}" title="${title}"}`,
    `\`\`\`${metadata.fenceLanguage}`,
    artifactContent,
    '```',
    ':::',
  ].join('\n');
}

function normalizeArtifactMetadataBlock(content: string): string {
  return content.replace(
    /(^|\n):::\s*artifact-type:\s*([^\r\n]+)\r?\n((?:::\s*artifact-(?:id|title):\s*[^\r\n]*\r?\n)*):::\s*\r?\n(```[A-Za-z0-9_-]*\r?\n[\s\S]*?\r?\n```)/g,
    (
      _match,
      leadingNewline: string,
      artifactType: string,
      attributeLines: string,
      body: string,
    ) => {
      const metadata = getArtifactDirectiveMetadata(artifactType);
      let identifier = metadata.identifier;
      let title = metadata.title;

      for (const line of attributeLines.split(/\r?\n/)) {
        const attribute = line.match(/^:::\s*artifact-(id|title):\s*(.+)$/);
        if (!attribute) {
          continue;
        }

        if (attribute[1] === 'id') {
          identifier = attribute[2];
        } else {
          title = attribute[2].trim();
        }
      }

      return `${leadingNewline}${normalizeArtifactDirective(body, {
        ...metadata,
        identifier,
        title,
      })}`;
    },
  );
}

function normalizeArtifactDirectiveAttributes(content: string): string {
  const normalizedMetadataBlocks = normalizeArtifactMetadataBlock(content);

  const normalizedArtifacts = normalizedMetadataBlocks.replace(
    /:::artifact\{([^}\n]+)\}/g,
    (_match, attributes: string) => {
      const normalizedAttributes = attributes.replace(/,\s+(?=(?:identifier|type|title)=)/g, ' ');

      return `:::artifact{${normalizedAttributes}}`;
    },
  );

  const normalizedBareArtifacts = normalizedArtifacts.replace(
    /:::artifact[ \t]*\n([\s\S]*?)\n:::/g,
    (_match, body: string) => {
      return normalizeArtifactDirective(body);
    },
  );

  return normalizedBareArtifacts.replace(
    /:::markdown(?:\{[^}\n]*\})?\n([\s\S]*?)\n:::/g,
    (_match, body: string) => {
      return normalizeArtifactDirective(body);
    },
  );
}

const Markdown = memo(function Markdown({ content = '', isLatestMessage }: TContentProps) {
  const LaTeXParsing = useRecoilValue<boolean>(store.LaTeXParsing);
  const isInitializing = content === '';

  const currentContent = useMemo(() => {
    if (isInitializing) {
      return '';
    }
    const normalizedContent = normalizeArtifactDirectiveAttributes(content);
    return LaTeXParsing ? preprocessLaTeX(normalizedContent) : normalizedContent;
  }, [content, LaTeXParsing, isInitializing]);

  const rehypePlugins = useMemo(
    () => [
      [rehypeKatex],
      [
        rehypeHighlight,
        {
          detect: true,
          ignoreMissing: true,
          subset: langSubset,
        },
      ],
    ],
    [],
  );

  const remarkPlugins: Pluggable[] = [
    supersub,
    remarkGfm,
    remarkDirective,
    artifactPlugin,
    [remarkMath, { singleDollarTextMath: false }],
    unicodeCitation,
    mcpUIResourcePlugin,
  ];

  if (isInitializing) {
    return (
      <div className="absolute">
        <p className="relative">
          <span className={isLatestMessage ? 'result-thinking' : ''} />
        </p>
      </div>
    );
  }

  return (
    <MarkdownErrorBoundary content={content} codeExecution={true}>
      <ArtifactProvider>
        <CodeBlockProvider>
          <ReactMarkdown
            /** @ts-ignore */
            remarkPlugins={remarkPlugins}
            /* @ts-ignore */
            rehypePlugins={rehypePlugins}
            components={
              {
                code,
                a,
                p,
                img,
                artifact: Artifact,
                citation: Citation,
                'highlighted-text': HighlightedText,
                'composite-citation': CompositeCitation,
                'mcp-ui-resource': MCPUIResource,
                'mcp-ui-carousel': MCPUIResourceCarousel,
              } as {
                [nodeType: string]: React.ElementType;
              }
            }
          >
            {currentContent}
          </ReactMarkdown>
        </CodeBlockProvider>
      </ArtifactProvider>
    </MarkdownErrorBoundary>
  );
});
Markdown.displayName = 'Markdown';

export default Markdown;
