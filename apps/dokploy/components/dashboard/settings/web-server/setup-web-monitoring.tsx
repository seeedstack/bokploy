import type React from "react";
import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { SetupMonitoring } from "../servers/setup-monitoring";

interface Props {
	children?: React.ReactNode;
}

export const SetupWebMonitoring = ({ children }: Props) => {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuItem
				className="w-full cursor-pointer space-x-3"
				onSelect={(e) => {
					e.preventDefault();
					setIsOpen(true);
				}}
			>
				{children}
			</DropdownMenuItem>
			<DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Setup Monitoring</DialogTitle>
					<DialogDescription>
						Configure monitoring for this Dokploy server, including watched
						volumes.
					</DialogDescription>
				</DialogHeader>
				<div className="rounded-xl bg-background shadow-md border">
					<SetupMonitoring />
				</div>
			</DialogContent>
		</Dialog>
	);
};
