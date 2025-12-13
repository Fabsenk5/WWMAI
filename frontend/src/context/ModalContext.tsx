import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import Modal from '../components/Modal';

interface ModalOptions {
    title?: string;
    body: ReactNode;
    onConfirm?: () => void;
    confirmText?: string;
    cancelText?: string;
    hideCancel?: boolean; // For simple alerts
}

interface ModalContextType {
    showModal: (options: ModalOptions) => void;
    hideModal: () => void;
    showAlert: (message: string, title?: string) => void;
    showConfirm: (message: string, onConfirm: () => void, title?: string) => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [options, setOptions] = useState<ModalOptions | null>(null);

    const showModal = useCallback((opts: ModalOptions) => {
        setOptions(opts);
        setIsOpen(true);
    }, []);

    const hideModal = useCallback(() => {
        setIsOpen(false);
        // Clear options after animation would theoretically finish, but here immediate is fine
        setTimeout(() => setOptions(null), 300);
    }, []);

    const showAlert = useCallback((message: string, title: string = 'Notice') => {
        showModal({
            title,
            body: message,
            hideCancel: true,
            confirmText: 'OK',
            onConfirm: hideModal
        });
    }, [showModal, hideModal]);

    const showConfirm = useCallback((message: string, onConfirm: () => void, title: string = 'Confirm') => {
        showModal({
            title,
            body: message,
            confirmText: 'Yes',
            cancelText: 'Cancel',
            onConfirm: () => {
                onConfirm();
                hideModal();
            }
        });
    }, [showModal, hideModal]);

    const handleConfirm = useCallback(() => {
        if (options?.onConfirm) {
            options.onConfirm();
        } else {
            hideModal();
        }
    }, [options, hideModal]);

    return (
        <ModalContext.Provider value={{ showModal, hideModal, showAlert, showConfirm }}>
            {children}
            {options && (
                <Modal
                    isOpen={isOpen}
                    onClose={hideModal}
                    title={options.title}
                    footer={
                        <>
                            {!options.hideCancel && (
                                <button className="modal-btn modal-btn-secondary" onClick={hideModal}>
                                    {options.cancelText || 'Cancel'}
                                </button>
                            )}
                            <button className="modal-btn modal-btn-primary" onClick={handleConfirm}>
                                {options.confirmText || 'OK'}
                            </button>
                        </>
                    }
                >
                    {typeof options.body === 'string' ? <p>{options.body}</p> : options.body}
                </Modal>
            )}
        </ModalContext.Provider>
    );
};

export const useModal = (): ModalContextType => {
    const context = useContext(ModalContext);
    if (!context) {
        throw new Error('useModal must be used within a ModalProvider');
    }
    return context;
};
