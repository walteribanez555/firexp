import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { seriesSchema, type SeriesFormValues } from '../schemas/series.schema';
import type { SeriesSummary } from '@fire-stick/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: SeriesSummary | null;
  onSubmit: (values: SeriesFormValues) => void;
  isPending: boolean;
}

export function SeriesDialog({ open, onOpenChange, editing, onSubmit, isPending }: Props) {
  const form = useForm<SeriesFormValues>({
    resolver: zodResolver(seriesSchema),
    defaultValues: { title: '', description: '', category: '', thumbnailUrl: '' },
  });

  useEffect(() => {
    if (editing) {
      form.reset({
        title: editing.title,
        description: editing.description,
        category: editing.category ?? '',
        thumbnailUrl: editing.thumbnailUrl ?? '',
      });
    } else {
      form.reset({ title: '', description: '', category: '', thumbnailUrl: '' });
    }
  }, [editing, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Series' : 'Create Series'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="My Series" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="What is this series about?" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Horror · Sci-Fi · Thriller…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="thumbnailUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Thumbnail URL (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="https://cdn.example.com/thumb.jpg" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving…' : editing ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
