export interface Profile {
  name: string;
  company: string;
  department?: string;
  position?: string;
  email: string;
  tel?: string;
  fullAddress?: string;
  message: string;
  [key: string]: string | undefined;
}
