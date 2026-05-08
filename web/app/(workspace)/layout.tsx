import PagePet from "@/components/pet/PagePet";
import PetAgentDialog from "@/components/pet/PetAgentDialog";
import PetBehaviors from "@/components/pet/PetBehaviors";
import WorkspaceSidebar from "@/components/sidebar/WorkspaceSidebar";
import { PetProvider } from "@/context/PetContext";
import { UnifiedChatProvider } from "@/context/UnifiedChatContext";

export default function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <UnifiedChatProvider>
      <PetProvider>
        <div className="flex h-screen overflow-hidden">
          <WorkspaceSidebar />
          <main className="flex-1 overflow-hidden bg-[var(--background)]">
            {children}
          </main>
          <PetBehaviors />
          <PetAgentDialog />
          <PagePet />
        </div>
      </PetProvider>
    </UnifiedChatProvider>
  );
}
