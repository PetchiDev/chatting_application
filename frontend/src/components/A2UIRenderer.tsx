import type { ReactNode } from 'react';
import type { A2uiAction, A2uiComponent, A2uiSurface } from '../types/ai';

interface Props {
  surface: A2uiSurface;
  onAction: (action: A2uiAction) => void;
}

function findComponent(components: A2uiComponent[], id: string) {
  return components.find((c) => c.id === id);
}

function renderNode(
  components: A2uiComponent[],
  id: string,
  onAction: (action: A2uiAction) => void
): ReactNode {
  const node = findComponent(components, id);
  if (!node) return null;

  switch (node.type) {
    case 'Column':
      return (
        <div className="a2ui-column">
          {(node.children ?? []).map((childId) => (
            <div key={childId}>{renderNode(components, childId, onAction)}</div>
          ))}
        </div>
      );
    case 'Row':
      return (
        <div className="a2ui-row">
          {(node.children ?? []).map((childId) => (
            <div key={childId}>{renderNode(components, childId, onAction)}</div>
          ))}
        </div>
      );
    case 'Text':
      return (
        <p className={`a2ui-text a2ui-text-${node.variant ?? 'body'}`}>
          {node.text}
        </p>
      );
    case 'Button':
      return (
        <button
          type="button"
          className="a2ui-btn"
          onClick={() => node.action && onAction(node.action)}
        >
          {node.label ?? node.text ?? 'Action'}
        </button>
      );
    case 'Card': {
      const child = node.child ? renderNode(components, node.child, onAction) : null;
      return <div className="a2ui-card">{child}</div>;
    }
    case 'List':
      return (
        <ul className="a2ui-list">
          {(node.items ?? []).map((item, i) => (
            <li key={item.id ?? i}>
              <button
                type="button"
                className="a2ui-list-item"
                onClick={() => item.action && onAction(item.action)}
              >
                <span className="a2ui-list-primary">{item.primaryText}</span>
                {item.secondaryText && (
                  <span className="a2ui-list-secondary">{item.secondaryText}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      );
    default:
      return null;
  }
}

export function A2UIRenderer({ surface, onAction }: Props) {
  const root = surface.components.find((c) => c.id === 'root') ?? surface.components[0];
  if (!root) return null;

  return (
    <div className="a2ui-surface">
      {renderNode(surface.components, root.id, onAction)}
    </div>
  );
}
