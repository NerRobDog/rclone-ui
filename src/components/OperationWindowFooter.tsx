export default function OperationWindowFooter({ children }: { children: React.ReactNode }) {
    return (
        <div className="sticky bottom-0 z-50 flex items-center justify-center flex-none gap-2 p-4 border-t border-divider bg-content1">
            {children}
        </div>
    )
}
