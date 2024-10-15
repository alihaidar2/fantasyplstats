import "react-table";

declare module "react-table" {
  export interface UseSortByColumnProps<D extends object> {
    getSortByToggleProps: (props?: any) => any;
    isSorted: boolean;
    isSortedDesc: boolean | undefined;
  }

  export interface ColumnInstance<D extends object = {}>
    extends UseSortByColumnProps<D> {}

  export interface HeaderGroup<D extends object = {}> {
    headers: Array<ColumnInstance<D>>;
  }
}
