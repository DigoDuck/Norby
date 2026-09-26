import { createElement } from "react";
import { iconForCategory } from "@/lib/categories";

/**
 * Ícone da categoria, decorativo: o nome dela sempre aparece ao lado.
 * createElement e não `<Icon />`: o ícone vem de um mapa fixo do módulo, mas a
 * regra react-hooks/static-components não distingue isso de um componente
 * criado no render.
 */
export default function CategoryIcon({ category, type, size = 16, className = "" }) {
  return createElement(iconForCategory(category, type), {
    size,
    className,
    "aria-hidden": "true",
  });
}
