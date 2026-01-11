// stores/registration.ts
import { create } from 'zustand';

interface RegistrationState {
    role: string;
    firstName: string;
    middleName: string;
    lastName: string;
    studentId: string;
    course: string;
    phone: string;
    idImageUri: string | null;
    email: string;
    password: string;
    confirmPassword: string;

    setFromRegister: (data: Partial<RegistrationState>) => void;
    setFromId: (uri: string | null) => void;
    setFromRegisterTwo: (data: Partial<RegistrationState>) => void;
    updateField: (field: keyof RegistrationState, value: string) => void;
    clearAll: () => void;
}

export const useRegistration = create<RegistrationState>((set) => ({
    role: '',
    firstName: '',
    middleName: '',
    lastName: '',
    studentId: '',
    course: '',
    phone: '',
    idImageUri: null,
    email: '',
    password: '',
    confirmPassword: '',

    setFromRegister: (data) => set(data),
    setFromId: (uri) => set({ idImageUri: uri }),
    setFromRegisterTwo: (data) => set(data),
    updateField: (field, value) => set({ [field]: value }),
    clearAll: () =>
        set({
            role: '',
            firstName: '',
            middleName: '',
            lastName: '',
            studentId: '',
            course: '',
            phone: '',
            idImageUri: null,
            email: '',
            password: '',
            confirmPassword: '',
        }),
}));
